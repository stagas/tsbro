# tsbro

TypeScript for the Browser. No tooling, no build step, simply works.

```html
<!doctype html>

<html lang="en">

<head>
  <title>Tsbro - TypeScript for the Browser</title>
  <script type="importmap">
    {
      "imports": {
        "tsbro": "./tsbro.js",
        "preact": "https://esm.sh/preact"
      }
    }
  </script>
</head>

<body>
  <div id="app"></div>

  <script type="module">
    import { register } from 'tsbro'

    register({
      jsx: 'preact',
    })
  </script>

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
