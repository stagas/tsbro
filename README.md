# tsbro

TypeScript for the Browser. No tooling, no build step, simply works.

> Update: If you like this you may want to check its sister project, [tssw](https://github.com/stagas/tssw) as well!

## Why?

TypeScript is still second-class citizen with regards to browser adoption, [there is a proposal to fix that](https://devblogs.microsoft.com/typescript/a-proposal-for-type-syntax-in-javascript/), but until then we have to use tooling, bundlers, build steps that are an impediment for when you want to quickly create a short demo or PoC. There are ways to run TypeScript code but it can't import other files or make use of remote packages.

**tsbro** solves this by completely bypassing the browser's import system using synchronous XHR, transpile with [swc wasm](https://swc.rs/docs/usage/wasm) and a sophisticated ESM-to-CJS transpiler so that synchronous `require` is used everywhere:

```
sync xhr fetch ts code -> transpile to js with swc -> convert esm to cjs -> eval
```

## Usage

```html
<!doctype html>

<html lang="en">

<head>
  <title>tsbro - TypeScript for the Browser</title>

  <!-- Only the `tsbro` import is needed, but here we show how it is used alongside a package. -->
  <script type="importmap">
    {
      "imports": {
        "tsbro": "https://unpkg.com/tsbro",
        "preact": "https://esm.sh/preact"
      }
    }
  </script>
</head>

<body>
  <div id="app"></div>

  <!-- Register the module globally and run scripts. -->
  <script type="module">
    import { register } from 'tsbro'

    register({
      jsx: 'preact', // The JSX pragma we want to use.
    })
  </script>

  <!-- Type can be text/typescript as well. -->
  <!-- We can also do src="./path-to-file.tsx". -->
  <script type="text/tsx">
    import { render } from 'preact'
    import { App } from './App.tsx'

    render(
      <App />,
      document.getElementById('app') as HTMLElement,
    )
  </script>
</body>

</html>
```

## Caveats

- *Problem:* TypeScript complaining it can't find types for modules, as we never install anything.

- *Solution:* Create an ambient `env.d.ts` file:
```ts
declare module '*'
```

- *Problem:* Stack traces are hard to read - because we transpile and eval code there are no filenames and the linecols become a mess.
- *Solution:* None yet.

## Suggested `tsconfig.json`:

```json
{
  "compilerOptions": {
    "jsx": "preserve",
    "noEmit": true,
    "allowImportingTsExtensions": true
  }
}
```

## Support

<a href="https://www.buymeacoffee.com/stagas" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" ></a>

## License

MIT
