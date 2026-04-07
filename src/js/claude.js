const API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-6'

export function getApiKey() {
  return localStorage.getItem('ht_api_key') || ''
}

export function setApiKey(key) {
  localStorage.setItem('ht_api_key', key.trim())
}

/**
 * Parse an arbejdsseddel PDF (as a base64 string) using Claude vision.
 * Returns structured project data.
 *
 * @param {string} pdfBase64 - Base64-encoded PDF (without data URI prefix)
 * @returns {Promise<{address, description, startDate, endDate, tasks}>}
 */
export async function parseArbejtsseddel(pdfBase64) {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('Ingen API-nøgle gemt. Gå til Indstillinger og tilføj din Anthropic API-nøgle.')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)

  let response
  try {
    response = await fetch(API_URL, {
      signal: controller.signal,
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system: `Du er en assistent der uddrager struktureret information fra arbejdssedler og tilbudsark fra e-conomic.
Returner KUN valid JSON — ingen markdown, ingen forklaringer, ingen kommentarer.
Hvis du ikke kan finde en oplysning, sæt feltet til null.`,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: pdfBase64
              }
            },
            {
              type: 'text',
              text: `Læs denne arbejdsseddel og uddrager følgende og returner som JSON:

{
  "address": "fuld adresse på arbejdsstedet, fx 'Nordbyvej 13, 4000 Roskilde'",
  "description": "kort overordnet beskrivelse af arbejdet eller null",
  "startDate": "startdato i YYYY-MM-DD format eller null",
  "endDate": "slutdato i YYYY-MM-DD format eller null",
  "tasks": [
    {
      "name": "opgavebeskrivelse, fx 'Udskift radiator i køkken'",
      "estimatedHours": estimeret antal timer som tal eller null
    }
  ]
}

Opgavelisten skal indeholde alle individuelle arbejdsopgaver nævnt i dokumentet.
Returner kun JSON, intet andet.`
            }
          ]
        }]
      })
    })
  } catch (err) {
    clearTimeout(timeout)
    if (err.name === 'AbortError') throw new Error('PDF-analyse tog for lang tid (timeout efter 30 sek). Tjek din internetforbindelse og prøv igen.')
    throw new Error(`Netværksfejl: ${err.message}`)
  }
  clearTimeout(timeout)

  if (!response.ok) {
    let errBody
    try { errBody = await response.json() } catch { errBody = {} }
    const msg = errBody?.error?.message || `HTTP ${response.status} ${response.statusText}`
    console.error('Claude API fejl:', response.status, errBody)
    if (response.status === 401) throw new Error('Ugyldig API-nøgle. Gå til Indstillinger og ret nøglen.')
    if (response.status === 429) throw new Error('API-kvote overskredet. Vent et øjeblik og prøv igen.')
    if (response.status === 413) throw new Error('PDF-filen er for stor til at sende. Prøv med en mindre fil.')
    throw new Error(`API fejl: ${msg}`)
  }

  let data
  try {
    data = await response.json()
  } catch (err) {
    throw new Error(`Uventet svar fra API (kunne ikke parse JSON): ${err.message}`)
  }

  const text = data.content?.[0]?.text?.trim() || ''
  if (!text) {
    console.error('Claude API svar uden indhold:', data)
    throw new Error('Claude returnerede tomt svar. Prøv igen.')
  }

  // Strip markdown code fences if Claude wraps the JSON anyway
  const cleaned = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()

  try {
    return JSON.parse(cleaned)
  } catch {
    console.error('Claude returnerede ikke-JSON tekst:', text)
    throw new Error('Claude returnerede ugyldigt JSON. Prøv igen eller opret projektet manuelt.')
  }
}

/**
 * Suggest task tags for untagged logs at end of day.
 *
 * @param {Array} logs - Array of log objects with note/type fields
 * @param {Array} tasks - Array of task objects with id/name fields
 * @returns {Promise<Array<{logId, taskId}>>}
 */
export async function suggestTaskTags(logs, tasks) {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('Ingen API-nøgle')

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 512,
      system: 'Du matcher logs til opgaver. Returner kun JSON-array, ingen markdown.',
      messages: [{
        role: 'user',
        content: `Opgaver:\n${tasks.map(t => `${t.id}: ${t.name}`).join('\n')}\n\nLogs:\n${logs.map(l => `${l.id}: ${l.note || '(foto)'}`).join('\n')}\n\nReturner: [{"logId":"...","taskId":"..."}] — brug null for taskId hvis ingen match.`
      }]
    })
  })

  if (!response.ok) throw new Error(`API fejl: ${response.status}`)

  const data = await response.json()
  const text = data.content?.[0]?.text?.trim() || '[]'
  const cleaned = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
  return JSON.parse(cleaned)
}
