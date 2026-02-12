import React from 'react'
import ReactDOM from 'react-dom/client'
import { init } from '@plausible-analytics/tracker'
import App from './App'
import './index.css'

init({ domain: 'blurrr.it' })

ReactDOM.createRoot(document.getElementById('root')).render(<App />)
