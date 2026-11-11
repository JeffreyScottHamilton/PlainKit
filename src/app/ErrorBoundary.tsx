import { Component, Fragment, type ReactNode } from 'react';
import { Button } from '@/components/ui';

type Props = { children: ReactNode };
type State = { failed: boolean; attempt: number };

/** Keeps a failing tool from taking down the shell. "Reload tool" remounts the tool subtree. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, attempt: 0 };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  private reload = () => this.setState((s) => ({ failed: false, attempt: s.attempt + 1 }));

  render() {
    if (this.state.failed) {
      return (
        <div className="page" role="alert">
          <h1>This tool stopped unexpectedly</h1>
          <p className="muted">Files and results in this session are kept. Reload the tool to try again.</p>
          <div>
            <Button variant="primary" onClick={this.reload}>
              Reload tool
            </Button>
          </div>
        </div>
      );
    }
    return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>;
  }
}
