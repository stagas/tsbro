const acorn = require('https://cdn.jsdelivr.net/npm/acorn/dist/acorn.min.js')

// Pure AST-based transformer for ESM to CJS conversion
module.exports = function esmToCjs(code, moduleName, currentPath) {
  // Function to resolve relative import paths against current module path
  function resolveImportPath(importPath) {
    if (!importPath) return importPath

    if (importPath.startsWith('.') && currentPath) {
      // This is a relative import that needs to be resolved against the current module's path
      const currentDir = currentPath.substring(0, currentPath.lastIndexOf('/') + 1)
      return new URL(importPath, currentDir).href
    }

    if (importPath.startsWith('/') && currentPath) {
      // This is an absolute path that needs to be resolved against the origin of the current module
      try {
        const origin = new URL(currentPath).origin
        return `${origin}${importPath}`
      }
      catch (e) {
        console.error('Failed to resolve absolute path:', e)
      }
    }

    return importPath
  }

  // Track if import.meta.url is used in the code
  let hasImportMetaUrl = false

  // Check if the code contains import.meta.url
  if (code.includes('import.meta.url')) {
    hasImportMetaUrl = true

    // Replace import.meta.url with _import.meta.url
    code = code.replace(/import\.meta\.url/g, '_import.meta.url')
  }

  // Parse the input code to an AST (after replacing import.meta.url)
  const ast = acorn.parse(code, {
    ecmaVersion: 2022,
    sourceType: 'module',
    allowAwaitOutsideFunction: true,
    allowYieldOutsideFunction: true
  })

  // Categorize all nodes
  const nonExportImportNodes = []
  const importDeclarations = []
  const exportDefaultDeclarations = []
  const exportNamedDeclarations = []
  const exportAllDeclarations = []

  // Separate the nodes by type for organized processing
  for (const node of ast.body) {
    if (node.type === 'ImportDeclaration') {
      importDeclarations.push(node)
    }
    else if (node.type === 'ExportDefaultDeclaration') {
      exportDefaultDeclarations.push(node)
    }
    else if (node.type === 'ExportNamedDeclaration') {
      exportNamedDeclarations.push(node)
    }
    else if (node.type === 'ExportAllDeclaration') {
      exportAllDeclarations.push(node)
    }
    else {
      nonExportImportNodes.push(node)
    }
  }

  // Start building the output
  let output = ['var exports = module.exports;']

  // Add _import.meta.url definition if it was used in the code
  if (hasImportMetaUrl) {
    output.push(`const _import = { meta: { url: '${currentPath || ''}' } };`)
  }

  output.push('')  // Add a blank line

  let exportNames = []
  let defaultExport = null

  // Track modules that have been imported to avoid duplicates
  const importedModules = new Map()

  // Process all import declarations first to ensure variables are defined before use
  for (const node of importDeclarations) {
    const source = node.source.value
    const resolvedPath = resolveImportPath(source)

    // Handle different import types
    if (node.specifiers.length === 0) {
      // Side-effect import: import 'module'
      output.push(`require('${resolvedPath}');`)
    }
    else {
      // Named and namespace imports
      const importLines = []

      // Default import: import defaultExport from 'module'
      const defaultSpecifier = node.specifiers.find(s => s.type === 'ImportDefaultSpecifier')
      if (defaultSpecifier) {
        importLines.push(`const ${defaultSpecifier.local.name} = require('${resolvedPath}').default;`)
      }

      // Namespace import: import * as name from 'module'
      const namespaceSpecifier = node.specifiers.find(s => s.type === 'ImportNamespaceSpecifier')
      if (namespaceSpecifier) {
        importLines.push(`const ${namespaceSpecifier.local.name} = require('${resolvedPath}');`)
      }

      // Named imports: import { export1, export2 as alias2 } from 'module'
      const namedSpecifiers = node.specifiers.filter(s => s.type === 'ImportSpecifier')
      if (namedSpecifiers.length > 0) {
        const bindings = namedSpecifiers
          .map(s => {
            const imported = s.imported.name
            const local = s.local.name
            return imported === local ? local : `${imported}: ${local}`
          })
          .join(', ')

        importLines.push(`const { ${bindings} } = require('${resolvedPath}');`)
      }

      output.push(importLines.join('\n'))
    }
  }

  // Process all non-export/import nodes first to maintain code order
  for (const node of nonExportImportNodes) {
    const originalCode = code.substring(node.start, node.end)
    output.push(originalCode)
  }

  // Process export declarations with declarations (hoisted to top level)
  for (const node of exportNamedDeclarations) {
    if (node.declaration) {
      // For export declarations (export function x() {}, export const x = 1)
      const declarationCode = code.substring(node.declaration.start, node.declaration.end)
      output.push(declarationCode)

      if (node.declaration.type === 'VariableDeclaration') {
        // For variable declarations, add exports for each variable
        for (const declarator of node.declaration.declarations) {
          if (declarator.id.type === 'Identifier') {
            // Simple case: export const name = value;
            const name = declarator.id.name
            output.push(`exports.${name} = ${name};`)
          }
          else if (declarator.id.type === 'ObjectPattern') {
            // Destructuring case: export const { a, b, c: renamed } = obj;
            for (const property of declarator.id.properties) {
              if (property.key) {
                // Get the exported name - for normal properties it's the key name,
                // for renamed properties it's the local binding name
                const exportedName = property.value.type === 'Identifier' ?
                  property.value.name : // For renamed exports (foo: bar), use the value name
                  property.key.name    // For simple exports (foo), use the key name

                output.push(`exports.${exportedName} = ${exportedName};`)
              }
            }
          }
        }
      }
      else if (node.declaration.type === 'FunctionDeclaration' ||
        node.declaration.type === 'ClassDeclaration') {
        // For function and class declarations, add export for the name
        if (node.declaration.id && node.declaration.id.name) {
          const name = node.declaration.id.name
          output.push(`exports.${name} = ${name};`)
        }
      }
    }
    // Only handle specifiers for named exports (export { hello }) if there's no source
    // This ensures we don't emit invalid references to re-exported variables
    if (node.specifiers && node.specifiers.length && !node.source) {
      for (const specifier of node.specifiers) {
        if (specifier.type === 'ExportSpecifier') {
          const local = specifier.local.name
          const exported = specifier.exported.name
          output.push(`exports.${exported} = ${local};`)
        }
        // ExportNamespaceSpecifier is handled in the re-export section only
      }
    }
  }

  // Process export-from declarations (re-exports)
  for (const node of exportNamedDeclarations) {
    if (node.source) {
      const source = node.source.value
      const resolvedPath = resolveImportPath(source)

      // Get the module variable name
      let moduleName
      if (importedModules.has(resolvedPath)) {
        moduleName = importedModules.get(resolvedPath)
      }
      else {
        moduleName = `_mod${importedModules.size}_${Math.random().toString(36).substring(2, 8)}`
        importedModules.set(resolvedPath, moduleName)
        output.push(`const ${moduleName} = require('${resolvedPath}');`)
      }

      // For each re-export (both named and namespace), create self-contained export assignments
      // that don't rely on separate declaration/export steps
      for (const specifier of node.specifiers) {
        if (specifier.type === 'ExportSpecifier') {
          // For named re-exports (export { name } from 'module')
          // Use direct property access instead of destructuring to avoid initialization issues
          const local = specifier.local.name
          const exported = specifier.exported.name
          output.push(`exports.${exported} = ${moduleName}.${local};`)
        }
        else if (specifier.type === 'ExportNamespaceSpecifier') {
          // For namespace re-exports (export * as name from 'module')
          const name = specifier.exported.name
          output.push(`exports.${name} = ${moduleName};`)
        }
      }
    }
  }

  // Process export * from 'module' declarations - use unique module names
  for (const node of exportAllDeclarations) {
    const source = node.source.value
    const resolvedPath = resolveImportPath(source)

    // Check if we've already imported this module
    let moduleName
    if (importedModules.has(resolvedPath)) {
      moduleName = importedModules.get(resolvedPath)
    }
    else {
      moduleName = `_mod${importedModules.size}_${Math.random().toString(36).substring(2, 8)}`
      importedModules.set(resolvedPath, moduleName)
      output.push(`const ${moduleName} = require('${resolvedPath}');`)
    }

    // Handle `export * as foo from 'module'`
    if (node.exported) {
      output.push(`exports.${node.exported.name} = ${moduleName};`)
    }
    else {
      // Regular `export * from 'module'`
      output.push(`Object.assign(exports, ${moduleName});`)
    }
  }

  // Process default exports
  for (const node of exportDefaultDeclarations) {
    if (node.declaration.type === 'Identifier') {
      // export default existingVariable
      defaultExport = node.declaration.name
    }
    else {
      // export default expression or anonymous function/class
      const declarationCode = code.substring(node.declaration.start, node.declaration.end)

      // For anonymous declarations, create a named variable
      const defaultVarName = '_default'
      output.push(`const ${defaultVarName} = ${declarationCode};`)
      defaultExport = defaultVarName
    }
  }

  // Add named exports at the end of the file
  for (const { local, exported } of exportNames) {
    output.push(`exports.${exported} = ${local};`)
  }
  // Do NOT emit export assignments for re-exports here; they are handled above in the re-export block.

  // Add default export
  if (defaultExport) {
    output.push(`exports.default = ${defaultExport};`)
    // Check if the default export is a function or class that we want to make callable
    if (code.includes(`function ${defaultExport}`) || code.includes(`class ${defaultExport}`)) {
      output.push(`module.exports = Object.assign(exports.default, exports);`)
    }
  }

  // Wrap in async IIFE if top-level await is present
  if (/\bawait\b/.test(code)) {
    return [
      'var exports = module.exports;',
      hasImportMetaUrl ? `const _import = { meta: { url: '${currentPath || ''}' } };` : '',
      '(async () => {',
      output.slice(hasImportMetaUrl ? 2 : 1).join('\n'), // skip the headers we already added
      '})().catch(e => { throw e; });'
    ].join('\n')
  }

  return output.join('\n')
}
