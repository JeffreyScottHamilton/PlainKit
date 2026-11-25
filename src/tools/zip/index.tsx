import { ToolPage } from '@/components/ToolPage';
import { Segmented } from '@/components/ui';
import { useToolState } from '@/session/toolState';
import { MakePanel } from './Make';
import { OpenPanel } from './Open';
import './zip.css';

type View = 'make' | 'open';
const VIEWS: { value: View; label: string }[] = [
  { value: 'make', label: 'Make a ZIP' },
  { value: 'open', label: 'Open a ZIP' },
];

export default function ZipTool() {
  const [st, set] = useToolState<{ view: View }>('zip-view', { view: 'make' });
  return (
    <ToolPage toolId="zip">
      <Segmented<View> label="What do you want to do?" value={st.view} options={VIEWS} onChange={(view) => set({ view })} />
      {st.view === 'make' ? <MakePanel /> : <OpenPanel />}
    </ToolPage>
  );
}
