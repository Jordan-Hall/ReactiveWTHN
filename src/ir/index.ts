import {Signal} from 'signal-polyfill';

export type NodeInstruction = StaticNode | DynamicNode;

export type DOMEventHandler<K extends keyof HTMLElementEventMap> = 
  (e: HTMLElementEventMap[K]) => void;

export type ElementProps = {
  class?: string;
  style?: Partial<CSSStyleDeclaration>;
  attrs?: Record<string, string>;
  on?: {
    [K in keyof HTMLElementEventMap]?: DOMEventHandler<K>;
  };
  draggable?: boolean;
} & Record<string, any>;

export interface StaticNode {
  type: 'static';
  element: Element | Text;
}

export interface DynamicNode {
  type: 'dynamic';
  id: string;
  target: Node;
  signals: Set<Signal.State<any> | Signal.Computed<any>>;
  bindings: Binding[];
  children: NodeInstruction[];
}

export type Binding = 
  | TextBinding
  | AttributeBinding
  | PropertyBinding
  | EventBinding
  | ClassBinding
  | StyleBinding
  | ForBinding
  | IfBinding;

export interface TextBinding {
  type: 'text';
  signal: Signal.State<any>;
  node: Text;
}

export interface AttributeBinding {
  type: 'attribute';
  name: string;
  signal: Signal.State<any>;
  element: Element;
}

export interface PropertyBinding {
  type: 'property';
  name: string;
  signal: Signal.State<any>;
  element: Element;
}

export interface EventBinding {
  type: 'event';
  name: string;
  handler: EventListener;
  element: Element;
}

export interface ClassBinding {
  type: 'class';
  name: string;
  signal: Signal.State<boolean>;
  element: Element;
}

export interface StyleBinding {
  type: 'style';
  property: string;
  signal: Signal.State<string | null>;
  element: HTMLElement;
}

export interface ForBinding<T = any> {
  type: 'for';
  items: Signal.State<T[]>;
  trackBy: (item: T) => any;
  template: (item: T) => NodeInstruction[];
  parent: Element;
  itemsMap: Map<any, NodeInstruction[]>;
  anchor: Comment;
}

export interface IfBinding {
  type: 'if';
  condition: Signal.State<boolean>;
  template: NodeInstruction[];
  elseTemplate?: NodeInstruction[];
  parent: Element;
  currentNodes: NodeInstruction[];
  anchor: Comment;
}

export class DOMBuilder {
  private static idCounter = 0;

  static element(
    tag: keyof HTMLElementTagNameMap,
    props: ElementProps = {},
    dynamicProps: Record<string, Signal.State<any> | Signal.Computed<any>> = {},
    children: NodeInstruction[] = []
  ): NodeInstruction {
    const element = document.createElement(tag);
    const bindings: Binding[] = [];
    const signals = new Set<Signal.State<any> | Signal.Computed<any>>();
    
    Object.entries(props).forEach(([key, value]) => {
      if (key === 'on' && typeof value === 'object') {
        Object.entries(value).forEach(([eventName, handler]) => {
          bindings.push({
            type: 'event',
            name: eventName,
            handler: handler as EventListener,
            element
          });
        });
      } else if (key === 'class') {
        element.className = value as string;
      } else if (key === 'style' && typeof value === 'object') {
        Object.assign(element.style, value);
      } else if (key === 'attrs' && typeof value === 'object') {
        Object.entries(value).forEach(([attrName, attrValue]) => {
          element.setAttribute(attrName, attrValue as string);
        });
      } else if (key === 'draggable') {
        element.draggable = value as boolean;
      } else if (!key.startsWith('on')) {
        element.setAttribute(key, String(value));
      }
    });

    Object.entries(dynamicProps).forEach(([key, signal]) => {
      signals.add(signal);
      if (key.startsWith('class:')) {
        bindings.push({
          type: 'class',
          name: key.slice(6),
          signal: signal as Signal.State<boolean>,
          element
        });
      } else if (key.startsWith('style:')) {
        bindings.push({
          type: 'style',
          property: key.slice(6),
          signal: signal as Signal.State<string | null>,
          element: element as HTMLElement
        });
      } else {
        bindings.push({
          type: 'attribute',
          name: key,
          signal: signal as Signal.State<string | null>,
          element
        });
      }
    });

    if (bindings.length === 0 && 
        signals.size === 0 && 
        !children.some(child => child.type === 'dynamic')) {
      children.forEach(child => {
        if (child.type === 'static') {
          element.appendChild(child.element);
        }
      });
      return { type: 'static', element };
    }

    return {
      type: 'dynamic',
      id: `d${DOMBuilder.idCounter++}`,
      target: element,
      signals,
      bindings,
      children
    };
  }

  static text(content: string | Signal.State<string>): NodeInstruction {
    if (typeof content === 'string') {
      return {
        type: 'static',
        element: document.createTextNode(content)
      };
    }

    const node = document.createTextNode('');
    return {
      type: 'dynamic',
      id: `d${DOMBuilder.idCounter++}`,
      target: node,
      signals: new Set([content]),
      bindings: [{
        type: 'text',
        signal: content,
        node
      }],
      children: []
    };
  }

  static for<T>(
    items: Signal.State<T[]>,
    trackBy: (item: T) => any,
    template: (item: T) => NodeInstruction[]
  ): NodeInstruction {
    const anchor = document.createComment('for');
    const parent = document.createElement('div');
    parent.appendChild(anchor);

    return {
      type: 'dynamic',
      id: `d${DOMBuilder.idCounter++}`,
      target: parent,
      signals: new Set([items]),
      bindings: [{
        type: 'for',
        items,
        trackBy,
        template,
        parent,
        itemsMap: new Map(),
        anchor
      }],
      children: []
    };
  }

  static if(
    condition: Signal.State<boolean>,
    template: NodeInstruction[],
    elseTemplate?: NodeInstruction[]
  ): NodeInstruction {
    const anchor = document.createComment('if');
    const parent = document.createElement('div');
    parent.appendChild(anchor);

    return {
      type: 'dynamic',
      id: `d${DOMBuilder.idCounter++}`,
      target: parent,
      signals: new Set([condition]),
      bindings: [{
        type: 'if',
        condition,
        template,
        elseTemplate,
        parent,
        currentNodes: [],
        anchor
      }],
      children: []
    };
  }
}