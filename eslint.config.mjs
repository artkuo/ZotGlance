// @ts-check Let TS check this config file

import zotero from "@zotero-plugin/eslint-config";

export default zotero({
  overrides: [
    // Snippets run inside Zotero via scripts/zq-eval.sh: async function
    // bodies with injected globals, not modules.
    { ignores: ["scripts/dev/**"] },
    {
      files: ["**/*.ts"],
      rules: {
        // We disable this rule here because the template
        // contains some unused examples and variables
        "@typescript-eslint/no-unused-vars": "off",
      },
    },
  ],
});
