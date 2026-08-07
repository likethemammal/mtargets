// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

// https://astro.build/config
export default defineConfig({
  site: "https://mtargets.dev",
  integrations: [
    starlight({
      title: "Metric Targets",
      description:
        "Metric Targets library and the mtargets file format for measurable quality targets",
      sidebar: [
        {
          label: "Guides",
          items: [
            { label: "Product layers", slug: "guides/product-layers" },
            { label: "Product schema", slug: "guides/product-schema" },
            { label: "Validate", slug: "guides/validate" },
            { label: "Consumers", slug: "guides/consumers" },
            { label: "Integrations", slug: "guides/integrations" },
            { label: "Subjects", slug: "guides/subjects" },
            { label: "Metrics catalog", slug: "guides/catalog" },
          ],
        },
        {
          label: "Reference",
          items: [
            { label: "Specification", slug: "reference/spec" },
            { label: "Advanced", slug: "reference/advanced" },
            { label: "Schema", slug: "reference/schema" },
          ],
        },
        {
          label: "API",
          items: [
            {
              label: "TypeScript API (TypeDoc)",
              link: "/api/",
            },
          ],
        },
      ],
    }),
  ],
});
