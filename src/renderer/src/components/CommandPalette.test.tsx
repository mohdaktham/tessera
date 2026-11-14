import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CommandPalette, type Command } from './CommandPalette';

function setup(open = true) {
  const run = { query: vi.fn(), sample: vi.fn(), orders: vi.fn() };
  const commands: Command[] = [
    {
      id: 'run-query',
      title: 'Run query',
      group: 'Query',
      keys: ['Ctrl', 'Enter'],
      run: run.query,
    },
    { id: 'load-sample', title: 'Load sample data', group: 'Data', run: run.sample },
    { id: 'table:orders', title: 'Preview orders', group: 'Tables', run: run.orders },
  ];
  const onClose = vi.fn();
  render(<CommandPalette open={open} commands={commands} onClose={onClose} />);
  return { run, onClose, user: userEvent.setup() };
}

describe('CommandPalette', () => {
  it('renders nothing while closed', () => {
    setup(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('lists every command, grouped, with the first one selected', () => {
    setup();
    const options = screen.getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      'Run queryCtrlEnter',
      'Load sample data',
      'Preview orders',
    ]);
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Tables')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveFocus();
  });

  it('filters as you type and highlights the matched letters', async () => {
    const { user } = setup();
    await user.type(screen.getByRole('combobox'), 'samp');
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(
      within(options[0] as HTMLElement).getByText('samp', { selector: 'mark' }),
    ).toBeInTheDocument();
  });

  it('runs the selected command with the keyboard, then closes', async () => {
    const { user, run, onClose } = setup();
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowUp}{Enter}');
    expect(run.sample).toHaveBeenCalledOnce();
    expect(run.query).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('runs a command on click', async () => {
    const { user, run } = setup();
    await user.click(screen.getByText('Preview orders'));
    expect(run.orders).toHaveBeenCalledOnce();
  });

  it('says so when nothing matches, and closes on Escape', async () => {
    const { user, onClose, run } = setup();
    await user.type(screen.getByRole('combobox'), 'zzz');
    expect(screen.getByText(/Nothing matches/)).toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(Object.values(run).every((fn) => fn.mock.calls.length === 0)).toBe(true);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });
});
