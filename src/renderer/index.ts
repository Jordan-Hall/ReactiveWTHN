import type { NodeInstruction, TextBinding, AttributeBinding, ClassBinding, StyleBinding, ForBinding, IfBinding, EventBinding } from '../ir';
import { BatchScheduler } from './batch';
import { effect } from './effect';

export class DOMRenderer {
  private cleanup: (() => void)[] = [];
  private scheduler = BatchScheduler.getInstance();
  private immediate = false;

  constructor(options: { immediate?: boolean } = {}) {
    this.immediate = options.immediate ?? false;
  }
  
  mount(
    instruction: NodeInstruction,
    container: Element
  ): () => void {
    const node = this.render(instruction);
    container.appendChild(node);
    
    return () => {
      this.cleanup.forEach(fn => fn());
      this.cleanup = [];
      if (node.parentNode) {
        node.parentNode.removeChild(node);
      }
    };
  }

  private scheduleUpdate(update: () => void): void {
    if (this.immediate) {
      update();
    } else {
      this.scheduler.schedule(update);
    }
  }

  private render(instruction: NodeInstruction): Node {
    if (instruction.type === 'static') {
      return instruction.element;
    }

    const { target, bindings, children } = instruction;

    bindings.forEach(binding => {
      switch (binding.type) {
        case 'text':
          this.setupTextBinding(binding);
          break;
        case 'attribute':
          this.setupAttributeBinding(binding);
          break;
        case 'event':
          this.setupEventBinding(binding);
          break;
        case 'class':
          this.setupClassBinding(binding);
          break;
        case 'style':
          this.setupStyleBinding(binding);
          break;
        case 'for':
          this.setupForBinding(binding);
          break;
        case 'if':
          this.setupIfBinding(binding);
          break;
      }
    });

    if (target instanceof Element) {
      children.forEach(child => {
        const childNode = this.render(child);
        target.appendChild(childNode);
      });
    }

    return target;
  }

  private setupEventBinding(binding: EventBinding): void {
    binding.element.addEventListener(binding.name, binding.handler);
    this.cleanup.push(() => {
      binding.element.removeEventListener(binding.name, binding.handler);
    });
  }

  private setupTextBinding(binding: TextBinding): void {
    this.cleanup.push(effect(() => {
      const newContent = String(binding.signal.get());
      const update = () => binding.node.textContent = newContent;
      this.scheduleUpdate(update);
    }));
  }

  private setupAttributeBinding(binding: AttributeBinding): void {
    this.cleanup.push(effect(() => {
      const value = binding.signal.get();
      const update = () => {
        if (value === null) {
          if (binding.name === 'value' && (binding.element instanceof HTMLInputElement || binding.element instanceof HTMLTextAreaElement)) {
            binding.element.value = ''
          } else {
            binding.element.removeAttribute(binding.name);
          }
        } else {
          if (binding.name === 'value' && (binding.element instanceof HTMLInputElement || binding.element instanceof HTMLTextAreaElement)) {
            binding.element.value = String(value)
          } else {
            binding.element.setAttribute(binding.name, String(value));
          }
        }
      };
      this.scheduleUpdate(update);
    }));
  }

  private setupClassBinding(binding: ClassBinding): void {
    this.cleanup.push(effect(() => {
      const value = binding.signal.get();
      const update = () => binding.element.classList.toggle(binding.name, Boolean(value));
      this.scheduleUpdate(update);
    }));
  }

  private setupStyleBinding(binding: StyleBinding): void {
    this.cleanup.push(effect(() => {
      const value = binding.signal.get();
      const update = () => {
        if (value === null) {
          binding.element.style.removeProperty(binding.property);
        } else {
          binding.element.style.setProperty(binding.property, String(value));
        }
      };
      this.scheduleUpdate(update);
    }));
  }

  private setupForBinding<T>(binding: ForBinding<T>): void {
    this.cleanup.push(effect(() => {
      const items = binding.items.get();
      const newKeys = new Set<any>();
      const fragment = document.createDocumentFragment();
      let lastNode: Node = binding.anchor;

      items.forEach((item: T) => {
        const key = binding.trackBy(item);
        newKeys.add(key);

        if (!binding.itemsMap.has(key)) {
          const instructions = binding.template(item);
          const nodes = instructions.map(instruction => this.render(instruction));
          binding.itemsMap.set(key, instructions);
          nodes.forEach(node => {
            fragment.appendChild(node);
            lastNode = node;
          });
        } else {
          const nodes = binding.itemsMap.get(key)!;
          nodes.forEach(node => {
            if (node.type === 'dynamic') {
              const domNode = node.target;
              if (domNode.previousSibling !== lastNode) {
                fragment.appendChild(domNode);
              }
              lastNode = domNode;
            }
          });
        }
      });

      const update = () => {
        for (const [key, nodes] of binding.itemsMap) {
          if (!newKeys.has(key)) {
            nodes.forEach(node => {
              if (node.type === 'dynamic') {
                const parentNode = node.target.parentNode;
                if (parentNode) {
                  parentNode.removeChild(node.target);
                }
              }
            });
            binding.itemsMap.delete(key);
          }
        }
        binding.parent.appendChild(fragment);
      };

      this.scheduleUpdate(update);
    }));
  }

  private setupIfBinding(binding: IfBinding): void {
    this.cleanup.push(effect(() => {
      const showTemplate = binding.condition.get();
      const template = showTemplate ? binding.template : binding.elseTemplate || [];

      const update = () => {
        binding.currentNodes.forEach(node => {
          if (node.type === 'dynamic') {
            const parentNode = node.target.parentNode;
            if (parentNode) {
              parentNode.removeChild(node.target);
            }
          }
        });

        const instructions = template.map(instruction => this.render(instruction));
        const fragment = document.createDocumentFragment();
        instructions.forEach(node => fragment.appendChild(node));
        binding.parent.insertBefore(fragment, binding.anchor);
        binding.currentNodes = template;
      };

      this.scheduleUpdate(update);
    }));
  }

  static flushUpdates(): void {
    BatchScheduler.getInstance().flush();
  }
}