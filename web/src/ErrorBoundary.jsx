import { Component } from 'react'

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="center-page">
          <div className="auth-card">
            <h1>Something went wrong</h1>
            <p className="error-text">{this.state.error.message}</p>
            <p className="hint-text">
              Try opening https://budget-tracker-74611.web.app in Safari and hard refresh.
            </p>
            <button className="btn primary" onClick={() => window.location.reload()}>
              Reload
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
