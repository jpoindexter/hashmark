const colorPattern = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})(?![0-9a-fA-F])(?=[$\s'"),.;:}\]>/]|$)/;

function literalContainsColor(node) {
  if (typeof node.value !== "string") return false;

  if (colorPattern.test(node.value)) return true;

  const functionMatch = node.value.match(/(rgb|rgba|hsl|hsla|oklch)\(/i);
  if (functionMatch) {
    if (!node.value.includes("var(")) {
      return true;
    }
  }

  return false;
}

export default {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow hard-coded hex/rgb/hsl colors — use design tokens",
    },
    schema: [],
  },
  create(context) {
    return {
      Literal(node) {
        if (literalContainsColor(node)) {
          context.report({
            node,
            message: "Use design tokens instead of hard-coded color values.",
          });
        }
      },
      TemplateElement(node) {
        const value = node.value?.raw ?? "";
        if (literalContainsColor({ value })) {
          context.report({
            node,
            message: "Use design tokens instead of hard-coded color values.",
          });
        }
      },
      JSXAttribute(node) {
        if (node.value?.type === "Literal" && typeof node.value.value === "string") {
          if (literalContainsColor(node.value)) {
            context.report({
              node,
              message: "Use design tokens instead of hard-coded color values.",
            });
          }
        }
      },
    };
  },
};
