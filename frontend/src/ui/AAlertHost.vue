<script setup lang="ts">
import {
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogRoot,
  AlertDialogTitle,
} from 'reka-ui';

import { useAlertState } from './alert';
import AButton from './AButton.vue';

const { request, finish } = useAlertState();

function onOpenChange(open: boolean) {
  if (!open) {
    finish(false);
  }
}
</script>

<template>
  <AlertDialogRoot :open="Boolean(request)" @update:open="onOpenChange">
    <AlertDialogPortal>
      <AlertDialogOverlay class="a-sheet__overlay" />
      <AlertDialogContent v-if="request" class="a-alert">
        <AlertDialogTitle class="a-alert__title">
          {{ request.title }}
        </AlertDialogTitle>
        <AlertDialogDescription class="a-alert__message">
          {{ request.message }}
        </AlertDialogDescription>
        <div class="a-alert__actions">
          <AlertDialogCancel as-child>
            <AButton size="large" @click="finish(false)">
              {{ request.cancelText }}
            </AButton>
          </AlertDialogCancel>
          <AButton
            size="large"
            :variant="request.destructive ? 'destructive' : 'filled'"
            @click="finish(true)"
          >
            {{ request.confirmText }}
          </AButton>
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>

<style>
.a-alert {
  position: fixed;
  top: 50%;
  left: 50%;
  z-index: var(--z-overlay);
  display: grid;
  gap: var(--space-5);
  width: calc(var(--space-8) * 10);
  max-width: calc(100vw - var(--space-8));
  padding: var(--space-7);
  color: var(--label);
  background: var(--bg-elevated);
  border-radius: var(--radius-2xl);
  box-shadow: var(--shadow-4), inset 0 0 0 0.5px var(--separator);
  transform: translate(-50%, -50%);
}

.a-alert[data-state='open'] {
  animation: a-sheet-in var(--dur-3) var(--ease-sheet);
}

.a-alert__title {
  margin: 0;
  font: var(--text-title-2);
  font-weight: 600;
  letter-spacing: var(--tracking-title-2);
  text-align: center;
}

.a-alert__message {
  margin: 0;
  font: var(--text-body);
  color: var(--label-2);
  text-align: center;
}

.a-alert__actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
}

@media (prefers-reduced-motion: reduce) {
  .a-alert[data-state='open'] {
    animation: none;
  }
}
</style>
