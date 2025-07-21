;(function() {
  let importmapObj
  const importmap = document.querySelector('script[type="importmap"]')
  if (importmap) {
    if (importmap.src) {
      const req = new XMLHttpRequest()
      req.open('get', importmap.src, false)
      req.send(null)
      if (req.status >= 200 && req.status < 400) {
        importmapObj = JSON.parse(req.responseText)
      }
    }
    else {
      importmapObj = JSON.parse(importmap.textContent ?? '{}')
    }
  }
  importmapObj ??= {}

  self.require = require

  require.paths = ['/node_modules']

  require.debug = false

  require.modules = Object.create(null)

  require.transforms = []

  require.transform = function(m) {
    for (const [index, transform] of require.transforms.entries()) {
      if (transform.test(m)) {
        if (require.debug) console.log(`Before [${index}]`, m.body)
        m.body = transform.transform(m)
        if (require.debug) console.log(`After [${index}]`, m.body)
      }
    }
  }

  require.resolve = function(name, parent) {
    if (require.debug) console.log('resolve:', name, 'parent:', parent)

    name = `${name}`

    if (name.startsWith('./') || name.startsWith('../')) {
      // Handle all relative paths explicitly
      var path = new URL(name, parent).href
      if (require.debug) console.log('relative resolved to:', path)
      return path
    }
    else if (importmapObj.imports?.[name]) {
      return importmapObj.imports[name]
    }
    else if ('/' === name[0]) {
      // Extract origin from parent path instead of using self.location.origin
      try {
        parent = new URL(parent).origin
      }
      catch (e) {
        parent = self.location.origin
      }
    }
    else if ('.' !== name[0]) {
      // Extract origin from parent path instead of using self.location.origin
      try {
        parent = new URL(parent).origin
      }
      catch (e) {
        parent = self.location.origin
        // to work with blob created Workers
        if ('blob' === parent.substr(0, 4)) {
          parent = self.location.origin
        }
      }
    }

    var path = new URL(name, parent).href
    if (require.debug) console.log('final resolved path:', path)

    if (path in require.modules) {
      return require.modules[path].path
    }
    else {
      return path
    }
  }

  require.eval = function(m) {
    require.transform(m)

    m.module = { exports: {} }
    m.exports = m.module.exports
    m.require = require.bind(null, m.path)
    if (require.debug) console.log('bound require for module:', m.path)
    Object.assign(m.require, require)
    m.fn = new Function('module', 'exports', 'require', m.body)
    m.didRun = false
    m.run = () => {
      m.didRun = true
      m.fn(m.module, m.module.exports, m.require)
      m.exports = m.module.exports // Update exports after run
    }

    return m
  }

  require.load = function(name, parent) {
    var path = require.resolve(name, parent)

    var m = require.modules[path] = require.modules[path]
      || {}

    if (m.isFetched) return m

    m.request = getModule(path)
    m.isFetched = true

    if (m.request === false) return m

    m.name = name
    m.path = path // Use the original resolved path instead of responseURL
    m.body = m.request.responseText

    require.eval(m)

    require.modules[m.path] = m

    return m
  }

  function require(parent, name) {
    if (arguments.length < 2) {
      // When called with one argument, that argument is the module name
      // and we use the current location as parent
      name = parent
      parent = self.location.href
    }
    // When called with two arguments (like from bound m.require),
    // parent is the first argument (m.path) and name is the second

    if (require.debug) {
      console.log('require called with parent:', parent, 'name:', name)
    }

    var m = require.load(name, parent)

    if (!m.request) {
      throw new Error(
        'Unable to load module "' + name + '" under "' + parent + '"',
      )
    }
    else if (!m.didRun) {
      m.didRun = true
      m.fn(m, m.exports, m.require)
    }

    return m.exports
  }

  function getModule(path) {
    var originalPath = path

    // Only strip location if the path is from the same origin as the current page
    var shouldStripLocation = false
    try {
      var pathUrl = new URL(path)
      var currentOrigin = self.location.origin
      if (pathUrl.origin === currentOrigin) {
        shouldStripLocation = true
      }
    }
    catch (e) {
      // If URL parsing fails, assume it's a relative path and strip location
      shouldStripLocation = true
    }

    if (shouldStripLocation) {
      var strippedPath = stripLocation(path)
      return get(strippedPath) || pathsGet(require.paths, strippedPath)
        || get(originalPath)
    }
    else {
      // For cross-origin paths, try the original path first
      return get(originalPath)
    }
  }

  function stripLocation(path) {
    var index = path.indexOf(self.location.origin)
    if (index === 0) path = path.substr(self.location.origin.length)
    return path
  }

  function pathsGet(paths, path) {
    paths = paths.slice()
    var p
    var req
    while (p = paths.shift()) {
      req = get(p + path)
      if (req) return req
    }
  }

  function get(path) {
    return (
      xhr(path)
      || xhr(path + '.js')
      || xhr(path + '.cjs')
      || xhr(path + '/index.js')
      || xhr(path + '/index.cjs')
    )
  }

  function xhr(path) {
    var req = new XMLHttpRequest()
    req.open('get', path, false)
    req.send(null)
    if (req.status >= 200 && req.status < 400) {
      return req
    }
    else {
      return false
    }
  }
})()

export function register(options = { jsx: 'react' }) {
  // add ESM-to-CJS transform
  const esmToCjs = require(new URL('./esm-to-cjs.js', import.meta.url))
  require.transforms.push({
    test: m => /\b(?:import|export)\b/.test(m.body),
    transform: m => esmToCjs(m.body, m.name, m.path),
  })

  // add support for TypeScript
  const ts = require('https://esm.sh/@swc/wasm-web')
  require.transforms.unshift({
    test: m => m.path.endsWith('.ts') || m.path.endsWith('.tsx'),
    transform: m =>
      ts.transformSync(m.body, {
        filename: m.path.split('/').pop(),
        jsc: {
          transform: {
            react: {
              runtime: 'automatic',
              importSource: options.jsx,
            },
          },
        },
      }).code,
  })

  // run all TypeScript inline script tags
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runTypeScriptScripts)
  }
  else {
    runTypeScriptScripts()
  }

  async function runTypeScriptScripts() {
    await ts.default()
    let i = 0
    document.querySelectorAll(`
      script[type="application/typescript"],
      script[type="text/typescript"]
    `).forEach(
      script => {
        if (script.src) {
          require(script.src)
        }
        else {
          const m = require.eval({
            body: script.textContent,
            name: '',
            path: `${self.location.origin}/inline-${i++}.ts`,
          })
          m.run()
        }
      },
    )

    document.querySelectorAll(`
      script[type="application/x-typescript"],
      script[type="text/x-typescript"],
      script[type="text/tsx"]
    `).forEach(script => {
      if (script.src) {
        require(script.src)
      }
      else {
        const m = require.eval({
          body: script.textContent,
          name: '',
          path: `${self.location.origin}/inline-${i++}.tsx`,
        })
        m.run()
      }
    })
  }
}
