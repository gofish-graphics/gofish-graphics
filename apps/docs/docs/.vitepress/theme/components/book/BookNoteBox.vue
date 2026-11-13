<script setup lang="ts">
// The note box of "Under the Surface": one small form, opened beside the
// passage it is about. BookNotes.vue opens it and places it; a transport from
// bookNotes.ts sends the note. The draft is kept in browser storage, keyed by
// chapter and passage, so it survives closing the box and reloading.
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import {
  MAX_NOTE,
  PROMPT,
  loadDraft,
  saveDraft,
  type Note,
  type Transport,
} from "./bookNotes";

const props = defineProps<{
  /** The note without its text. */
  note: Omit<Note, "text">;
  /** The storage key of this passage's draft. */
  draftKey: string;
  transport: Transport;
}>();
// `delivered`: the note reached its destination, so the passage is marked.
const emit = defineEmits<{ close: [delivered: boolean] }>();
let delivered = false;

const text = ref(loadDraft(props.draftKey));
const busy = ref(false);
const done = ref("");
const error = ref("");
const area = ref<HTMLTextAreaElement>();
const status = ref<HTMLElement>();
let timer: ReturnType<typeof setTimeout> | undefined;

const about = computed(() => {
  const q = props.note.quote.replace(/\s+/g, " ").trim();
  if (!q) return "This chapter as a whole";
  return q.length > 80 ? `${q.slice(0, 80).trimEnd()}…` : q;
});
const id = `book-note-${Math.random().toString(36).slice(2, 8)}`;

watch(text, (t) => {
  error.value = "";
  saveDraft(props.draftKey, t);
});

onMounted(() => area.value?.focus());
onBeforeUnmount(() => clearTimeout(timer));

async function submit() {
  if (busy.value || done.value) return;
  if (!text.value.trim()) {
    error.value = "Write a note first.";
    area.value?.focus();
    return;
  }
  busy.value = true;
  try {
    const sent = await props.transport.send({
      ...props.note,
      text: text.value,
    });
    done.value = sent.message;
    delivered = sent.delivered;
    saveDraft(props.draftKey, "");
    await nextTick();
    status.value?.focus();
    timer = setTimeout(() => emit("close", delivered), 2200);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}

function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    emit("close", delivered);
  } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    submit();
  }
}
</script>

<template>
  <div
    class="book-note-box"
    role="dialog"
    :aria-labelledby="`${id}-label`"
    @keydown="onKey"
  >
    <template v-if="!done">
      <p class="book-note-box__about">
        <span class="book-note-box__on">On</span> {{ about }}
      </p>
      <label
        :id="`${id}-label`"
        :for="`${id}-text`"
        class="book-note-box__label"
      >
        {{ PROMPT }}
      </label>
      <textarea
        :id="`${id}-text`"
        ref="area"
        v-model="text"
        rows="3"
        :maxlength="MAX_NOTE"
        :aria-describedby="error ? `${id}-error` : undefined"
      />
      <p
        v-if="error"
        :id="`${id}-error`"
        class="book-note-box__error"
        role="alert"
      >
        {{ error }}
      </p>
      <div class="book-note-box__actions">
        <button
          type="button"
          class="book-note-box__send"
          :disabled="busy"
          @click="submit"
        >
          {{ transport.action }}
        </button>
        <button
          type="button"
          class="book-note-box__cancel"
          @click="emit('close', false)"
        >
          Cancel
        </button>
      </div>
      <p v-if="transport.hint" class="book-note-box__hint">
        {{ transport.hint }}
      </p>
    </template>
    <p
      v-else
      :id="`${id}-label`"
      ref="status"
      class="book-note-box__done"
      role="status"
      tabindex="-1"
    >
      {{ done }}
    </p>
  </div>
</template>
