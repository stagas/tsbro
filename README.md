# tsbro

TypeScript for the Browser. No tooling, no build step, simply works.

## Usage

```html
<!doctype html>

<html lang="en">

<head>
  <title>Tsbro - TypeScript for the Browser</title>

  <!-- Only the `tsbro` import is needed, but here we should how it is used with a package. -->
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

  <!-- Require step: Registers the module globally and runs scripts. -->
  <script type="module">
    import { register } from 'tsbro'

    register({
      jsx: 'preact', // The jsx we want to use.
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

## License

MIT
