import { ToolPage } from '@/components/ToolPage';
import { Notice } from '@/components/ui';

export default function Tool() {
  return (
    <ToolPage toolId="qr-code">
      <Notice kind="info">This tool is not built yet. It is on the roadmap and nothing here is functional.</Notice>
    </ToolPage>
  );
}
