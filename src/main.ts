import { Signal } from 'signal-polyfill';
import { DOMBuilder } from './ir';
import { DOMRenderer } from './renderer';

interface Task {
  id: string;
  title: string;
  status: 'todo' | 'inProgress' | 'done';
}

const tasks = new Signal.State<Task[]>([]);
const newTaskTitle = new Signal.State('');
const draggedTask = new Signal.State<Task | null>(null);

function createTask(title: string): Task {
  return {
    id: Math.random().toString(36).substring(2, 9),
    title,
    status: 'todo'
  };
}

function moveTask(task: Task, status: Task['status']): void {
  const currentTasks = tasks.get();
  const updatedTasks = currentTasks.map(t => 
    t.id === task.id ? { ...t, status } : t
  );
  tasks.set(updatedTasks);
}

function addTask(): void {
  const title = newTaskTitle.get();
  if (!title.trim()) return;
  
  const task = createTask(title);
  const currentTasks = tasks.get();
  tasks.set([...currentTasks, task]);
  newTaskTitle.set('');
}

function removeTask(id: string): void {
  const currentTasks = tasks.get();
  tasks.set(currentTasks.filter(t => t.id !== id));
}

function createKanbanBoard() {
  const inputField = createInput();
  const addButton = createAddButton();

  const todoColumn = createColumn('To Do', 'todo');
  const inProgressColumn = createColumn('In Progress', 'inProgress');
  const doneColumn = createColumn('Done', 'done');

  return DOMBuilder.element('div', {
    class: 'flex flex-col h-screen bg-gray-100 p-6'
  }, {}, [
    DOMBuilder.element('h1', {
      class: 'text-3xl font-bold mb-8 text-center text-gray-800'
    }, {}, [
      DOMBuilder.text('Task Board')
    ]),
    
    DOMBuilder.element('div', {
      class: 'max-w-md mx-auto w-full mb-8'
    }, {}, [
      inputField,
      addButton
    ]),

    DOMBuilder.element('div', {
      class: 'flex gap-6 overflow-auto flex-1'
    }, {}, [
      todoColumn,
      inProgressColumn,
      doneColumn
    ])
  ]);
}

function createInput() {
  const input = DOMBuilder.element('input', {
    class: 'w-full p-2 mb-4 border rounded',
    placeholder: 'Enter a new task...',
    on: {
      input: (e: Event) => {
        newTaskTitle.set((e.target as HTMLInputElement).value);
      },
      keydown: (e: KeyboardEvent) => {
        if (e.key === 'Enter') addTask();
      }
    },
    type: 'text'
  }, {
    value: newTaskTitle
  });

  return input;
}

function createAddButton() {
  const button = DOMBuilder.element('button', {
    class: 'w-full p-2 mb-8 bg-blue-500 text-white rounded hover:bg-blue-600',
    on: {
      click: () => addTask()
    }
  }, {}, [
    DOMBuilder.text('Add Task')
  ]);

  return button;
}

function createColumn(title: string, status: Task['status']) {
  const tasksContainer = DOMBuilder.element('div', {
    class: 'space-y-2'
  }, {}, [
    DOMBuilder.for(
      tasks,
      task => task.id,
      task => task.status === status ? [createTaskItem(task, status)] : []
    )
  ]);

  return DOMBuilder.element('div', {
    class: 'flex-1 bg-gray-200 rounded-lg p-4 min-w-[300px]',
    on: {
      dragover: (e: DragEvent) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).classList.add('bg-gray-300');
      },
      dragleave: (e: DragEvent) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).classList.remove('bg-gray-300');
      },
      drop: (e: DragEvent) => {
        e.preventDefault();
        debugger;
        (e.currentTarget as HTMLElement).classList.remove('bg-gray-300');
        const task = draggedTask.get();
        if (task && task.status !== status) {
          moveTask(task, status);
        }
        draggedTask.set(null);
      }
    }
  }, {}, [
    DOMBuilder.element('h2', {
      class: 'text-lg font-semibold mb-4 text-gray-700'
    }, {}, [
      DOMBuilder.text(title)
    ]),
    tasksContainer
  ]);
}

function createTaskItem(task: Task, columnStatus: Task['status']) {
  if (task.status !== columnStatus) {
    return DOMBuilder.element('div', {}, {});
  }

  return DOMBuilder.element('div', {
    class: 'bg-white rounded-lg p-4 mb-2 shadow cursor-move',
    draggable: true,
    on: {
      dragstart: () => {
        draggedTask.set(task);
      },
      dragend: () => {
        draggedTask.set(null);
      }
    }
  }, {
    'class:opacity-50': new Signal.Computed(() => draggedTask.get() === task)
  }, [
    DOMBuilder.element('p', {
      class: 'text-gray-800 mb-2'
    }, {}, [
      DOMBuilder.text(task.title)
    ]),
    DOMBuilder.element('div', {
      class: 'flex justify-end gap-2'
    }, {}, [
      createActionButton('Delete', 'bg-red-500 hover:bg-red-600', () => removeTask(task.id))
    ])
  ]);
}

function createActionButton(
  text: string,
  className: string,
  onClick: () => void
) {
  const button = DOMBuilder.element('button', {
    class: `px-2 py-1 text-sm text-white rounded ${className}`,
    on: {
      click: () => onClick()
    }
  }, {}, [
    DOMBuilder.text(text)
  ]);

  return button;
}

const app = createKanbanBoard();
const renderer = new DOMRenderer();
const root = document.getElementById('app');

if (root) {
  renderer.mount(app, root);
  tasks.set([
    createTask('Plan project'),
    createTask('Design UI'),
    createTask('Implement features')
  ]);

}