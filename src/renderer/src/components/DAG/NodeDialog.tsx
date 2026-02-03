import { useState, type JSX, type FormEvent } from 'react';
import { Dialog, DialogHeader, DialogBody, DialogFooter, Input, Button } from '../UI';
import './NodeDialog.css';

export interface NodeDialogProps {
  onCreate: (title: string) => void;
  onClose: () => void;
}

export default function NodeDialog({
  onCreate,
  onClose,
}: NodeDialogProps): JSX.Element {
  const [title, setTitle] = useState('');

  const handleSubmit = (e: FormEvent): void => {
    e.preventDefault();
    if (title.trim()) {
      onCreate(title.trim());
      onClose();
    }
  };

  return (
    <Dialog open={true} onClose={onClose} size="sm">
      <DialogHeader title="New Task" />

      <form onSubmit={handleSubmit}>
        <DialogBody>
          <div className="node-dialog__form">
            <div className="node-dialog__field">
              <label htmlFor="task-title" className="node-dialog__label">
                Task Name
              </label>
              <Input
                id="task-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter task name"
                required
                autoFocus
              />
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!title.trim()}>
            Create
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
