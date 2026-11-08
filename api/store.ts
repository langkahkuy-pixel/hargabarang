import { configuredStoreApi } from '../server/api.js'

export default { fetch: configuredStoreApi(process.env) }
