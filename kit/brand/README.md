# @artbucket/brand

One release of a brand from [Artbucket](https://github.com/pwnera/artbucket), read at build time, and
the manifest of what the site used. MIT.

```bash
npm install @artbucket/brand
npx artbucket brand export .brand --brand acme
```

```js
import { loadBrand } from "@artbucket/brand";

const brand = await loadBrand(".brand");
brand.value("color.primary");
brand.rules("color.*");
await brand.copyFiles("dist");
await brand.writeManifest("dist"); // dist/artbucket.site.json: lineage, the use check, rebuilds
```

Docs: https://docs.artbucket.io/developers/kit
