// MySandbox.tsx
import { defineComponent } from "vue";
import { Sandbox, sandboxProps } from "vitepress-plugin-sandpack";

/**
 * extends from Sandbox.
 * Compared to VUE single file, it is simple and straightforward.
 */
export const GoFishLive = defineComponent({
  name: "GoFishLive",
  props: sandboxProps,
  setup(props, { slots }) {
    return () => {
      // Convert string numbers to actual numbers for numeric props
      // This is needed because markdown passes all props as strings
      const normalizedProps = {
        ...props,
        previewHeight:
          props.previewHeight != null
            ? typeof props.previewHeight === "string"
              ? parseInt(props.previewHeight)
              : props.previewHeight
            : undefined,
        coderHeight:
          props.coderHeight != null
            ? typeof props.coderHeight === "string"
              ? parseInt(props.coderHeight)
              : props.coderHeight
            : undefined,
      };

      return (
        <Sandbox
          {...normalizedProps}
          options={{
            showLineNumbers: true,
          }}
          customSetup={{
            deps: {
              "gofish-graphics": "nightly",
            },
          }}
        >
          {slots?.default ? slots.default() : null}
        </Sandbox>
      );
    };
  },
});
