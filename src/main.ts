import { Plugin } from 'obsidian';
import { refreshStructuredMetadata, styles } from './metadataEnhancer';

const PATCH_FLAG_PREFIX = '__obsidianNestedFrontmatterPatched__';
const STRUCTURED_WIDGET_NAMES = ['text', 'multitext'] as const;

type PropertyWidget = {
  render?: (el: HTMLElement, data: unknown, ctx: { onChange: (value: unknown) => void }) => unknown;
} & Record<string, unknown>;

export default class ObsidianNestedFrontmatterPlugin extends Plugin {
  async onload(): Promise<void> {
    for (const widgetName of STRUCTURED_WIDGET_NAMES) {
      this.registerPatch(widgetName);
    }
    this.registerStyles();
    this.registerRefreshHooks();
  }

  private registerRefreshHooks(): void {
    const scheduleRefresh = (): void => {
      this.refreshStructuredMetadata();
      window.requestAnimationFrame(() => this.refreshStructuredMetadata());
    };

    const scheduleBootstrapRefreshes = (): void => {
      scheduleRefresh();
      for (const delay of [50, 150, 400, 1000]) {
        const timeoutId = window.setTimeout(() => this.refreshStructuredMetadata(), delay);
        this.register(() => window.clearTimeout(timeoutId));
      }
    };

    this.registerEvent(this.app.workspace.on('layout-change', scheduleRefresh));
    this.registerEvent(this.app.workspace.on('active-leaf-change', scheduleRefresh));
    this.registerEvent(this.app.workspace.on('file-open', scheduleBootstrapRefreshes));
    scheduleBootstrapRefreshes();
  }

  private refreshStructuredMetadata(): void {
    refreshStructuredMetadata(document, {
      openLink: (linkPath) => {
        const sourcePath = this.app.workspace.getActiveFile()?.path ?? '';
        this.app.workspace.openLinkText(linkPath, sourcePath, false);
      },
    });
  }

  private registerPatch(widgetName: (typeof STRUCTURED_WIDGET_NAMES)[number]): void {
    const widget = (this.app as unknown as { metadataTypeManager?: { registeredTypeWidgets?: Record<string, PropertyWidget> } })
      .metadataTypeManager?.registeredTypeWidgets?.[widgetName];
    const patchFlag = `${PATCH_FLAG_PREFIX}${widgetName}`;
    if (!widget || widget[patchFlag] || typeof widget.render !== 'function') return;

    const originalRender = widget.render.bind(widget);
    widget.render = (el: HTMLElement, data: unknown, ctx: { onChange: (value: unknown) => void }) => {
      const rendered = originalRender(el, data, ctx);
      window.requestAnimationFrame(() => this.refreshStructuredMetadata());
      return rendered;
    };

    widget[patchFlag] = true;
    this.register(() => {
      widget.render = originalRender;
      delete widget[patchFlag];
    });
  }

  private registerStyles(): void {
    const styleEl = document.createElement('style');
    styleEl.setAttribute('data-obsidian-nested-frontmatter', 'true');
    styleEl.textContent = styles;
    document.head.append(styleEl);
    this.register(() => styleEl.remove());
  }
}
