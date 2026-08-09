import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:", "nostr:"]);
const SAFE_IMAGE_PROTOCOLS = new Set(["http:", "https:"]);

function safeUrl(url: string, image: boolean): string {
  if (url.startsWith("#") || (!image && url.startsWith("/"))) return url;
  try {
    const parsed = new URL(url);
    return (image ? SAFE_IMAGE_PROTOCOLS : SAFE_LINK_PROTOCOLS).has(
      parsed.protocol,
    )
      ? url
      : "";
  } catch {
    return "";
  }
}

export function MessageMarkdown({
  compact = false,
  content,
}: {
  compact?: boolean;
  content: string;
}) {
  return (
    <div
      className={
        compact
          ? "buzz-message-markdown line-clamp-2 max-h-10 max-w-full overflow-hidden break-words text-sm leading-5 [&_p]:inline [&_pre]:inline [&_pre]:bg-transparent [&_pre]:p-0"
          : "buzz-message-markdown max-w-full break-words text-base leading-6"
      }
    >
      <Markdown
        components={{
          a: ({ children, href }) =>
            compact ? (
              <span>{children}</span>
            ) : (
              <a href={href} rel="noopener noreferrer" target="_blank">
                {children}
              </a>
            ),
          img: ({ alt, src }) =>
            compact ? (
              <span>{alt || "Image"}</span>
            ) : (
              <img alt={alt ?? ""} loading="lazy" src={src} />
            ),
        }}
        remarkPlugins={[remarkGfm]}
        urlTransform={(url, key) => safeUrl(url, key === "src")}
      >
        {content}
      </Markdown>
    </div>
  );
}
