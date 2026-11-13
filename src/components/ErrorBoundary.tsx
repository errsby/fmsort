import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
  componentName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[ErrorBoundary] Caught error in ${this.props.componentName || 'component'}:`, error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          role="alert"
          style={{
            padding: 16,
            margin: '12px 0',
            background: '#1a1012',
            border: '1px solid #7f1d1d',
            borderRadius: 8,
            color: '#fca5a5',
            fontSize: 12,
            fontFamily: 'inherit',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontWeight: 600 }}>
            <AlertTriangle size={16} style={{ color: '#ef4444' }} />
            <span>Error displaying {this.props.componentName || 'this component'}</span>
          </div>
          <p style={{ margin: '0 0 10px', color: '#f87171', fontSize: 11 }}>
            {this.state.error?.message || 'An unexpected rendering error occurred.'}
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              padding: '4px 10px',
              background: '#2d1519',
              border: '1px solid #991b1b',
              color: '#fecaca',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            <RefreshCw size={12} />
            <span>Try Again</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
