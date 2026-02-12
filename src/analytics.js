import { init, track as _track } from '@plausible-analytics/tracker'

const domain = import.meta.env.VITE_PLAUSIBLE_DOMAIN
if (domain) init({ domain })

const track = domain ? _track : () => {}
export { track }
