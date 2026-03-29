import type { StructuredValue } from './structured';
import { classifyStructuredValue, isPlainObject, parseWikilink, tryParseStructuredValue } from './structured';

export interface LinkContext {
  openLink: (linkPath: string) => void;
}

export const STRUCTURED_PROPERTY_CLASS = 'onf-structured-property';
export const STRUCTURED_VALUE_CLASS = 'onf-structured-value';

function createDiv(document: Document, className?: string, text?: string): HTMLDivElement {
  const element = document.createElement('div');
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function createSpan(document: Document, className?: string, text?: string): HTMLSpanElement {
  const element = document.createElement('span');
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

export function renderStructuredValue(containerEl: HTMLElement, value: StructuredValue, context: LinkContext): void {
  const { ownerDocument: document } = containerEl;

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
      renderStructuredValue(contentEl, item, context);
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
      renderStructuredValue(valueEl, nestedValue, context);
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

export function enhanceMetadataProperty(propertyEl: HTMLElement, context: LinkContext): boolean {
  const valueContainer = propertyEl.querySelector<HTMLElement>('.metadata-property-value');
  if (!valueContainer) return false;

  const rawValueEl = valueContainer.querySelector<HTMLElement>('.metadata-property-value-item, .metadata-input-longtext');
  if (!rawValueEl) return false;

  const rawText = rawValueEl.textContent ?? '';
  const previousRawText = valueContainer.dataset.onfStructuredSource ?? '';
  const { structuredValue, shouldRender } = classifyStructuredValue(rawText, previousRawText);
  const enhancedEl = valueContainer.querySelector<HTMLElement>(`.${STRUCTURED_VALUE_CLASS}`);

  if (!structuredValue) {
    enhancedEl?.remove();
    rawValueEl.style.display = '';
    valueContainer.classList.remove(STRUCTURED_PROPERTY_CLASS);
    delete valueContainer.dataset.onfStructuredSource;
    return false;
  }

  if (!shouldRender && enhancedEl) {
    rawValueEl.style.display = 'none';
    valueContainer.classList.add(STRUCTURED_PROPERTY_CLASS);
    return true;
  }

  const nextEnhancedEl = enhancedEl ?? createDiv(valueContainer.ownerDocument, STRUCTURED_VALUE_CLASS);
  nextEnhancedEl.className = STRUCTURED_VALUE_CLASS;
  nextEnhancedEl.textContent = '';
  renderStructuredValue(nextEnhancedEl, structuredValue, context);

  if (!enhancedEl) {
    valueContainer.append(nextEnhancedEl);
  }

  rawValueEl.style.display = 'none';
  valueContainer.classList.add(STRUCTURED_PROPERTY_CLASS);
  valueContainer.dataset.onfStructuredSource = rawText;
  return true;
}

export function refreshStructuredMetadata(root: ParentNode, context: LinkContext): number {
  let enhancedCount = 0;
  root.querySelectorAll<HTMLElement>('.metadata-property').forEach((propertyEl) => {
    if (enhanceMetadataProperty(propertyEl, context)) {
      enhancedCount += 1;
    }
  });
  return enhancedCount;
}

export function readStructuredValue(value: unknown): StructuredValue | null {
  return tryParseStructuredValue(value);
}

export const styles = `
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
