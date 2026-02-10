const restrictedProps = new Set([
  "color",
  "background",
  "backgroundColor",
  "borderColor",
  "borderBottomColor",
  "borderTopColor",
  "borderLeftColor",
  "borderRightColor",
  "boxShadow",
  "fontSize",
  "fontFamily",
  "fontWeight",
  "lineHeight",
  "letterSpacing",
  "margin",
  "marginTop",
  "marginBottom",
  "marginLeft",
  "marginRight",
  "padding",
  "paddingTop",
  "paddingBottom",
  "paddingLeft",
  "paddingRight",
  "gap",
]);

export default {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow inline style props for design token values",
    },
    schema: [],
  },
  create(context) {
    return {
      JSXAttribute(node) {
        if (node.name?.name !== "style") return;
        if (!node.value || node.value.type !== "JSXExpressionContainer") return;
        const expr = node.value.expression;
        if (expr.type !== "ObjectExpression") return;

        for (const property of expr.properties) {
          if (property.type !== "Property") continue;
          if (property.key.type !== "Identifier") continue;
          if (!restrictedProps.has(property.key.name)) continue;

          context.report({
            node: property,
            message: `Use design tokens via Tailwind classes instead of inline "${property.key.name}" styles.`,
          });
        }
      },
    };
  },
};
