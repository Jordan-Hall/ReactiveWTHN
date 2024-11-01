import type { NodeInstruction, TextBinding, AttributeBinding, ClassBinding, StyleBinding, ForBinding, EventBinding, DynamicNode, Binding } from '../ir';
import { BatchScheduler } from './batch';
import { effect } from './effect';

type DOMCache = {
  nodes: Node[];
  cleanup: (() => void)[];
};

export class DOMRenderer {
  private cache = new WeakMap<NodeInstruction, DOMCache>();
  private scheduler = BatchScheduler.getInstance();
  private immediate: boolean;

  constructor(options: { immediate?: boolean } = {}) {
    this.immediate = options.immediate ?? false;
  }

  mount(instruction: NodeInstruction, container: Element): () => void {
    const { nodes, cleanup } = this.renderWithCache(instruction);
    nodes.forEach(node => container.appendChild(node));
    
    return () => {
      cleanup.forEach(fn => fn());
      nodes.forEach(node => {
        if (node.parentNode) {
          node.parentNode.removeChild(node);
        }
      });
      this.cache = new WeakMap();
    };
  }

  private scheduleUpdate(update: () => void): void {
    if (this.immediate) {
      update();
    } else {
      this.scheduler.schedule(update);
    }
  }

  private renderWithCache(instruction: NodeInstruction): { nodes: Node[]; cleanup: (() => void)[] } {
    const cached = this.cache.get(instruction);
    if (cached) {
      return cached;
    }

    const cleanup: (() => void)[] = [];
    let nodes: Node[];

    if (instruction.type === 'static') {
      nodes = [instruction.element.cloneNode(true)];
    } else {
      const rendered = this.renderDynamic(instruction, cleanup);
      nodes = Array.isArray(rendered) ? rendered : [rendered];
    }

    const cache = { nodes, cleanup };
    this.cache.set(instruction, cache);
    return cache;
  }

  private renderDynamic(instruction: DynamicNode, cleanup: (() => void)[]): Node | Node[] {
    const { target, bindings, children } = instruction;

    // Handle For binding specially to avoid wrapper div
    const forBinding = bindings.find(b => b.type === 'for') as ForBinding | undefined;
    if (forBinding) {
      return this.renderForBinding(forBinding, cleanup);
    }

    bindings.forEach(binding => {
      const disposer = this.createBinding(binding);
      if (disposer) cleanup.push(disposer);
    });

    if (target instanceof Element && children.length > 0) {
      children.forEach(child => {
        const { nodes: childNodes, cleanup: childCleanup } = this.renderWithCache(child);
        cleanup.push(...childCleanup);
        childNodes.forEach(node => target.appendChild(node));
      });
    }

    return target;
  }

  private createBinding(binding: Binding): (() => void) | void {
    switch (binding.type) {
      case 'text':
        return this.createTextBinding(binding);
      case 'attribute':
        return this.createAttributeBinding(binding);
      case 'class':
        return this.createClassBinding(binding);
      case 'style':
        return this.createStyleBinding(binding);
      case 'event':
        return this.createEventBinding(binding);
    }
  }

  private createTextBinding(binding: TextBinding): () => void {
    return effect(() => {
      const value = binding.signal.get();
      this.scheduleUpdate(() => {
        binding.node.textContent = String(value);
      });
    });
  }

  private createAttributeBinding(binding: AttributeBinding): () => void {
    return effect(() => {
      const value = binding.signal.get();
      this.scheduleUpdate(() => {
        if (value === null || value === undefined) {
          if (binding.name === 'value' && (binding.element instanceof HTMLInputElement || binding.element instanceof HTMLTextAreaElement)) {
            binding.element.value = '';
          } else {
            binding.element.removeAttribute(binding.name);
          }
        } else {
          if (binding.name === 'value' && (binding.element instanceof HTMLInputElement || binding.element instanceof HTMLTextAreaElement)) {
            binding.element.value = String(value);
          } else {
            binding.element.setAttribute(binding.name, String(value));
          }
        }
      });
    });
  }

  private createClassBinding(binding: ClassBinding): () => void {
    return effect(() => {
      const value = binding.signal.get();
      this.scheduleUpdate(() => {
        binding.element.classList.toggle(binding.name, Boolean(value));
      });
    });
  }

  private createStyleBinding(binding: StyleBinding): () => void {
    return effect(() => {
      const value = binding.signal.get();
      this.scheduleUpdate(() => {
        if (value === null) {
          binding.element.style.removeProperty(binding.property);
        } else {
          binding.element.style.setProperty(binding.property, String(value));
        }
      });
    });
  }

  private createEventBinding(binding: EventBinding): () => void {
    binding.element.addEventListener(binding.name, binding.handler);
    return () => {
      binding.element.removeEventListener(binding.name, binding.handler);
    };
  }

  private renderForBinding<T>(binding: ForBinding<T>, parentCleanup: (() => void)[]): Node[] {
    const itemMap = new Map<any, {
      nodes: Node[];
      cleanup: (() => void)[];
      item: T;
      instructions: NodeInstruction[];
    }>();

    const cleanup = effect(() => {
      const items = binding.items.get();
      const updates: (() => void)[] = [];
      const newKeys = new Set<any>();
      let currentNodes = Array.from(binding.parent.childNodes)
        .filter(node => node !== binding.anchor) as ChildNode[];

      // First, generate all item templates and track new keys
      const processedItems = items.flatMap((item: T) => {
        const key = binding.trackBy(item);
        const instructions = binding.template(item);
        if (instructions.length === 0) return [];
        
        newKeys.add(key);
        return [{ key, item, instructions }];
      });

      // Process each item
      processedItems.forEach(({ key, item, instructions }, index) => {
        let entry = itemMap.get(key);
        const needsUpdate = !entry || !itemsEqual(entry.item, item);

        if (needsUpdate) {
          // Clean up old entry if it exists
          if (entry) {
            entry.cleanup.forEach(cleanup => cleanup());
            entry.nodes.forEach(node => {
              const idx = currentNodes.indexOf(node as ChildNode);
              if (idx !== -1) currentNodes.splice(idx, 1);
            });
          }

          // Create new nodes
          const nodes: Node[] = [];
          const itemCleanup: (() => void)[] = [];

          instructions.forEach(instruction => {
            const { nodes: itemNodes, cleanup } = this.renderWithCache(instruction);
            nodes.push(...itemNodes);
            itemCleanup.push(...cleanup);
          });

          entry = { nodes, cleanup: itemCleanup, item, instructions };
          itemMap.set(key, entry);
        }

        // Ensure entry is defined after potential update
        if (!entry) return;

        // Schedule position update
        entry.nodes.forEach((node, nodeIndex) => {
          const currentIndex = currentNodes.indexOf(node as ChildNode);
          const desiredIndex = index + nodeIndex;

          if (currentIndex === -1) {
            // Node needs to be inserted
            const referenceNode = currentNodes[desiredIndex] || binding.anchor;
            if (referenceNode.parentNode) {
              updates.push(() => referenceNode.parentNode!.insertBefore(node, referenceNode));
            }
            currentNodes.splice(desiredIndex, 0, node as ChildNode);
          } else if (currentIndex !== desiredIndex) {
            // Node needs to move
            currentNodes.splice(currentIndex, 1);
            currentNodes.splice(desiredIndex, 0, node as ChildNode);
            const referenceNode = currentNodes[desiredIndex + 1] || binding.anchor;
            if (referenceNode.parentNode) {
              updates.push(() => referenceNode.parentNode!.insertBefore(node, referenceNode));
            }
          }
        });
      });

      // Remove old items
      const removals: (() => void)[] = [];
      for (const [key, entry] of itemMap) {
        if (!newKeys.has(key)) {
          entry.cleanup.forEach(cleanup => cleanup());
          entry.nodes.forEach(node => {
            removals.push(() => {
              if (node.parentNode) {
                node.parentNode.removeChild(node);
              }
            });
          });
          itemMap.delete(key);
        }
      }

      // Execute updates
      this.scheduleUpdate(() => {
        removals.forEach(remove => remove());
        updates.forEach(update => update());
      });
    });

    parentCleanup.push(cleanup);
    return [binding.anchor];
  }

  static flushUpdates(): void {
    BatchScheduler.getInstance().flush();
  }
}

// Helper function to compare items
function itemsEqual<T>(a: T, b: T): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  if (a === null || b === null) return false;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) return false;

  return keysA.every(key => (a as any)[key] === (b as any)[key]);
}