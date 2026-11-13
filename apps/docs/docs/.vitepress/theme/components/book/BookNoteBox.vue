<script setup lang="ts">
// The feedback box of "Under the Surface": one small form, opened beside the
// passage it is about. BookNotes.vue opens it and places it; a transport from
// bookNotes.ts sends it. A reader picks one of four reactions, may mark that
// they stopped reading here, and may write a few words; a reaction or a stop
// alone is complete feedback. The draft is kept in browser storage, keyed by
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
  REACTIONS,
  loadDraft,
  promptFor,
  saveDraft,
  type Note,
  type Reaction,
  type Transport,
} from "./bookNotes";

const props = defineProps<{
  /** The note without what the reader fills in. */
  note: Omit<Note, "reaction" | "stopped" | "text">;
  /** The storage key of this passage's draft. */
  draftKey: string;
  transport: Transport;
}>();
// `delivered`: the feedback reached its destination, so the passage is marked.
const emit = defineEmits<{ close: [delivered: boolean] }>();
let delivered = false;

const draft = loadDraft(props.draftKey);
const reaction = ref<Reaction | undefined>(draft.reaction);
const stopped = ref(draft.stopped);
const text = ref(draft.text);
const busy = ref(false);
const done = ref("");
const error = ref("");
const radios = ref<HTMLButtonElement[]>([]);
const status = ref<HTMLElement>();
let timer: ReturnType<typeof setTimeout> | undefined;

const prompt = computed(() => promptFor(reaction.value));
const ready = computed(
  () => !!reaction.value || stopped.value || !!text.value.trim()
);
/** The radio that takes Tab: the chosen one, or the first. */
const tabbable = computed(() =>
  Math.max(
    0,
    REACTIONS.findIndex((r) => r.value === reaction.value)
  )
);
const id = `book-note-${Math.random().toString(36).slice(2, 8)}`;

watch([reaction, stopped, text], () => {
  error.value = "";
  saveDraft(props.draftKey, {
    reaction: reaction.value,
    stopped: stopped.value,
    text: text.value,
  });
});

onMounted(() => radios.value[tabbable.value]?.focus());
onBeforeUnmount(() => clearTimeout(timer));

/** Choose a reaction; choosing the chosen one again clears it. */
function choose(value: Reaction) {
  reaction.value = reaction.value === value ? undefined : value;
}

/** Arrow keys move through the reactions and choose, as radios do. */
function onRadioKey(e: KeyboardEvent, i: number) {
  const step =
    e.key === "ArrowRight" || e.key === "ArrowDown"
      ? 1
      : e.key === "ArrowLeft" || e.key === "ArrowUp"
        ? -1
        : 0;
  if (!step) return;
  e.preventDefault();
  const next = (i + step + REACTIONS.length) % REACTIONS.length;
  reaction.value = REACTIONS[next].value;
  radios.value[next]?.focus();
}

async function submit() {
  if (busy.value || done.value) return;
  if (!ready.value) {
    error.value = "Choose a reaction or write a few words first.";
    radios.value[tabbable.value]?.focus();
    return;
  }
  busy.value = true;
  try {
    const sent = await props.transport.send({
      ...props.note,
      reaction: reaction.value,
      stopped: stopped.value,
      text: text.value,
    });
    done.value = sent.message;
    delivered = sent.delivered;
    saveDraft(props.draftKey, {
      reaction: undefined,
      stopped: false,
      text: "",
    });
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
    aria-label="Feedback"
    @keydown="onKey"
  >
    <template v-if="!done">
      <p :id="`${id}-reaction`" class="book-note-box__group">Your reaction</p>
      <div
        class="book-note-box__reactions"
        role="radiogroup"
        :aria-labelledby="`${id}-reaction`"
      >
        <button
          v-for="(r, i) in REACTIONS"
          :key="r.value"
          ref="radios"
          type="button"
          role="radio"
          class="book-note-box__reaction"
          :aria-checked="reaction === r.value"
          :tabindex="i === tabbable ? 0 : -1"
          @click="choose(r.value)"
          @keydown="onRadioKey($event, i)"
        >
          <span class="book-note-box__emoji" aria-hidden="true">{{
            r.emoji
          }}</span>
          {{ r.label }}
        </button>
      </div>
      <label class="book-note-box__stopped">
        <input v-model="stopped" type="checkbox" />
        I stopped reading here
      </label>
      <label :for="`${id}-text`" class="book-note-box__label">
        {{ prompt }}
      </label>
      <textarea
        :id="`${id}-text`"
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
          :disabled="busy || !ready"
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
      ref="status"
      class="book-note-box__done"
      role="status"
      tabindex="-1"
    >
      {{ done }}
    </p>
  </div>
</template>
