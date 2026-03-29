// @ts-check

let PluginBase;
try {
  ({ Plugin: PluginBase } = require('obsidian'));
} catch {
  PluginBase = class {};
}
/** @type {typeof import('obsidian').Plugin} */
const Plugin = /** @type {typeof import('obsidian').Plugin} */ (PluginBase);

const PATCH_FLAG_PREFIX = '__obsidianNestedFrontmatterPatched__';
const STRUCTURED_WIDGET_NAMES = ['text', 'multitext'];
const STRUCTURED_PROPERTY_CLASS = 'onf-structured-property';
const STRUCTURED_VALUE_CLASS = 'onf-structured-value';

/**
 * @typedef {{ displayText: string, linkPath: string }} ParsedWikilink
 * @typedef {string | number | boolean | null | unknown[] | Record<string, unknown>} StructuredValue
 * @typedef {{ shouldRender: boolean, structuredValue: StructuredValue | null }} StructuredClassification
 * @typedef {{ openLink: (linkPath: string) => void }} LinkContext
 * @typedef {{ onChange: (value: unknown) => void }} PropertyContext
 * @typedef {{ render?: (el: HTMLElement, data: unknown, ctx: PropertyContext) => unknown, [key: string]: unknown }} PropertyWidget
 */

/**
 * @param {unknown} value
 * @returns {value is { [key: string]: StructuredValue }}
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {StructuredValue | null}
 */
function tryParseStructuredValue(value) {
  if (Array.isArray(value) || isPlainObject(value)) {
    return /** @type {StructuredValue} */ (value);
  }
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return null;

  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) || isPlainObject(parsed) ? /** @type {StructuredValue} */ (parsed) : null;
  } catch {
    return null;
  }
}

/**
 * @param {unknown} value
 * @returns {ParsedWikilink | null}
 */
function parseWikilink(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const match = trimmed.match(/^\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]$/);
  if (!match) return null;

  const linkPath = match[1] ? match[1].trim() : '';
  if (!linkPath) return null;

  return {
    linkPath,
    displayText: match[2] ? match[2].trim() : linkPath,
  };
}

/**
 * @param {string} rawValue
 * @param {string} previousRawValue
 * @returns {StructuredClassification}
 */
function classifyStructuredValue(rawValue, previousRawValue) {
  const structuredValue = tryParseStructuredValue(rawValue);
  return {
    structuredValue,
    shouldRender: Boolean(structuredValue) && rawValue !== previousRawValue,
  };
}

/**
 * @param {Document} document
 * @param {string=} className
 * @param {string=} text
 * @returns {HTMLDivElement}
 */
function createDiv(document, className, text) {
  const element = document.createElement('div');
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

/**
 * @param {Document} document
 * @param {string=} className
 * @param {string=} text
 * @returns {HTMLSpanElement}
 */
function createSpan(document, className, text) {
  const element = document.createElement('span');
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

/**
 * @param {unknown} value
 * @returns {value is HTMLElement}
 */
function isHtmlElement(value) {
  return Boolean(value) && typeof value === 'object' && value !== null && /** @type {{ nodeType?: unknown }} */ (value).nodeType === 1;
}

/**
 * @param {HTMLElement} containerEl
 * @param {StructuredValue} value
 * @param {LinkContext} context
 */
function renderStructuredValue(containerEl, value, context) {
  const document = containerEl.ownerDocument;

  if (Array.isArray(value)) {
    containerEl.classList.add('onf-array');
    if (value.length === 0) {
      containerEl.append(createDiv(document, 'onf-empty', '[]'));
      return;
    }

    value.forEach((item, index) => {
      const itemEl = createDiv(document, 'onf-array-item');
      const indexEl = createDiv(document, 'onf-index', String(index + 1));
      indexEl.setAttribute('aria-hidden', 'true');
      const contentEl = createDiv(document, 'onf-item-content');
      renderStructuredValue(contentEl, /** @type {StructuredValue} */ (item), context);
      itemEl.append(indexEl, contentEl);
      containerEl.append(itemEl);
    });
    return;
  }

  if (isPlainObject(value)) {
    containerEl.classList.add('onf-object');
    const entries = Object.entries(value);
    if (entries.length === 0) {
      containerEl.append(createDiv(document, 'onf-empty', '{}'));
      return;
    }

    entries.forEach(([key, nestedValue]) => {
      const rowEl = createDiv(document, 'onf-row');
      const keyEl = createDiv(document, 'onf-key', key);
      const valueEl = createDiv(document, 'onf-value');
      renderStructuredValue(valueEl, /** @type {StructuredValue} */ (nestedValue), context);
      rowEl.append(keyEl, valueEl);
      containerEl.append(rowEl);
    });
    return;
  }

  if (typeof value === 'string') {
    const wikilink = parseWikilink(value);
    if (wikilink) {
      const wrapperEl = createDiv(document, 'metadata-link onf-native-link');
      const linkEl = createDiv(document, 'metadata-link-inner internal-link onf-link', wikilink.displayText);
      linkEl.setAttribute('data-href', wikilink.linkPath);
      linkEl.setAttribute('draggable', 'true');
      wrapperEl.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        context.openLink(wikilink.linkPath);
      });
      wrapperEl.append(linkEl);
      containerEl.append(wrapperEl);
      return;
    }
  }

  if (value === null) {
    containerEl.append(createSpan(document, 'onf-scalar onf-null', 'null'));
    return;
  }

  containerEl.append(createSpan(document, 'onf-scalar', String(value)));
}

/**
 * @param {HTMLElement} propertyEl
 * @param {LinkContext} context
 * @returns {boolean}
 */
function enhanceMetadataProperty(propertyEl, context) {
  const valueContainer = propertyEl.querySelector('.metadata-property-value');
  if (!(isHtmlElement(valueContainer))) return false;

  const rawValueEl = valueContainer.querySelector('.metadata-property-value-item, .metadata-input-longtext');
  if (!(isHtmlElement(rawValueEl))) return false;

  const rawText = rawValueEl.textContent ?? '';
  const previousRawText = valueContainer.dataset.onfStructuredSource ?? '';
  const { structuredValue, shouldRender } = classifyStructuredValue(rawText, previousRawText);
  const enhancedEl = valueContainer.querySelector(`.${STRUCTURED_VALUE_CLASS}`);

  if (!structuredValue) {
    if (isHtmlElement(enhancedEl)) enhancedEl.remove();
    rawValueEl.style.display = '';
    valueContainer.classList.remove(STRUCTURED_PROPERTY_CLASS);
    delete valueContainer.dataset.onfStructuredSource;
    return false;
  }

  if (!shouldRender && isHtmlElement(enhancedEl)) {
    rawValueEl.style.display = 'none';
    valueContainer.classList.add(STRUCTURED_PROPERTY_CLASS);
    return true;
  }

  const nextEnhancedEl = isHtmlElement(enhancedEl) ? enhancedEl : createDiv(valueContainer.ownerDocument, STRUCTURED_VALUE_CLASS);
  nextEnhancedEl.className = STRUCTURED_VALUE_CLASS;
  nextEnhancedEl.textContent = '';
  renderStructuredValue(nextEnhancedEl, structuredValue, context);

  if (!(isHtmlElement(enhancedEl))) {
    valueContainer.append(nextEnhancedEl);
  }

  rawValueEl.style.display = 'none';
  valueContainer.classList.add(STRUCTURED_PROPERTY_CLASS);
  valueContainer.dataset.onfStructuredSource = rawText;
  return true;
}

/**
 * @param {ParentNode} root
 * @param {LinkContext} context
 * @returns {number}
 */
function refreshStructuredMetadata(root, context) {
  let enhancedCount = 0;
  root.querySelectorAll('.metadata-property').forEach((propertyEl) => {
    if (isHtmlElement(propertyEl) && enhanceMetadataProperty(propertyEl, context)) {
      enhancedCount += 1;
    }
  });
  return enhancedCount;
}

const styles = `
  .metadata-property-value.${STRUCTURED_PROPERTY_CLASS} {
    align-items: stretch;
  }

  .${STRUCTURED_VALUE_CLASS} {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 100%;
    padding: 0;
    cursor: default;
  }

  .onf-object,
  .onf-array {
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 100%;
  }

  .onf-row,
  .onf-array-item {
    display: grid;
    grid-template-columns: minmax(84px, 132px) 1fr;
    gap: 10px;
    align-items: start;
    padding: 2px 0;
  }

  .onf-array-item {
    grid-template-columns: 18px 1fr;
  }

  .onf-key,
  .onf-index {
    color: var(--text-muted);
    font-size: var(--font-ui-smaller);
    line-height: 1.4;
    padding-top: 1px;
  }

  .onf-value,
  .onf-item-content {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .onf-item-content {
    border-left: 1px solid var(--background-modifier-border);
    padding-left: 10px;
  }

  .onf-native-link {
    width: fit-content;
  }

  .onf-native-link .metadata-link-inner {
    cursor: pointer;
  }

  .onf-empty,
  .onf-scalar {
    line-height: var(--line-height-normal);
  }

  .onf-empty,
  .onf-null {
    color: var(--text-muted);
  }
`;

class ObsidianNestedFrontmatterPlugin extends Plugin {
  async onload() {
    for (const widgetName of STRUCTURED_WIDGET_NAMES) {
      this.registerPatch(widgetName);
    }
    this.registerStyles();
    this.registerRefreshHooks();
  }

  registerRefreshHooks() {
    const scheduleRefresh = () => {
      this.refreshStructuredMetadata();
      window.requestAnimationFrame(() => this.refreshStructuredMetadata());
    };

    const scheduleBootstrapRefreshes = () => {
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

  refreshStructuredMetadata() {
    refreshStructuredMetadata(document, {
      openLink: (linkPath) => {
        const sourcePath = this.app.workspace.getActiveFile()?.path ?? '';
        this.app.workspace.openLinkText(linkPath, sourcePath, false);
      },
    });
  }

  /**
   * @param {string} widgetName
   */
  registerPatch(widgetName) {
    /** @type {{ metadataTypeManager?: { registeredTypeWidgets?: Record<string, PropertyWidget> } }} */
    const appWithMetadataTypeManager = /** @type {{ metadataTypeManager?: { registeredTypeWidgets?: Record<string, PropertyWidget> } }} */ (/** @type {unknown} */ (this.app));
    const widget = appWithMetadataTypeManager.metadataTypeManager?.registeredTypeWidgets?.[widgetName];
    const patchFlag = `${PATCH_FLAG_PREFIX}${widgetName}`;
    if (!widget || widget[patchFlag] || typeof widget.render !== 'function') return;

    const originalRender = widget.render.bind(widget);
    widget.render = (el, data, ctx) => {
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

  registerStyles() {
    const styleEl = document.createElement('style');
    styleEl.setAttribute('data-obsidian-nested-frontmatter', 'true');
    styleEl.textContent = styles;
    document.head.append(styleEl);
    this.register(() => styleEl.remove());
  }
}

module.exports = {
  default: ObsidianNestedFrontmatterPlugin,
  __test__: {
    STRUCTURED_PROPERTY_CLASS,
    STRUCTURED_VALUE_CLASS,
    classifyStructuredValue,
    enhanceMetadataProperty,
    isPlainObject,
    parseWikilink,
    refreshStructuredMetadata,
    tryParseStructuredValue,
  },
};
