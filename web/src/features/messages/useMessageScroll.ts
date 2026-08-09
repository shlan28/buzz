import { useCallback, useLayoutEffect, useRef } from "react";

const AT_BOTTOM_THRESHOLD = 32;

export function useMessageScroll(
  channelId: string | undefined,
  messageIds: string[],
) {
  const containerRef = useRef<HTMLElement | null>(null);
  const atBottomRef = useRef(true);
  const initializedChannelRef = useRef<string | undefined>(undefined);
  const forceBottomRef = useRef(false);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const container = containerRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior });
    atBottomRef.current = true;
  }, []);

  useLayoutEffect(() => {
    if (!channelId || initializedChannelRef.current === channelId) return;
    initializedChannelRef.current = channelId;
    atBottomRef.current = true;
    const frame = requestAnimationFrame(() => scrollToBottom());
    return () => cancelAnimationFrame(frame);
  }, [channelId, scrollToBottom]);

  useLayoutEffect(() => {
    if (!messageIds.length) return;
    if (!atBottomRef.current && !forceBottomRef.current) return;
    forceBottomRef.current = false;
    const frame = requestAnimationFrame(() => scrollToBottom());
    return () => cancelAnimationFrame(frame);
  }, [messageIds, scrollToBottom]);

  const onScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    atBottomRef.current =
      container.scrollHeight - container.clientHeight - container.scrollTop <=
      AT_BOTTOM_THRESHOLD;
  }, []);

  const scrollToBottomOnNextUpdate = useCallback(() => {
    forceBottomRef.current = true;
  }, []);

  return { containerRef, onScroll, scrollToBottomOnNextUpdate };
}
