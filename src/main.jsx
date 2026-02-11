import React from 'react'
import ReactDOM from 'react-dom/client'
import Plausible from '@plausible-analytics/tracker'
import App from './App'
import './index.css'

Plausible({ domain: 'blurrr.it' }).enableAutoPageviews()

ReactDOM.createRoot(document.getElementById('root')).render(<App />)
