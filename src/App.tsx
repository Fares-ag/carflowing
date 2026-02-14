import { useState, useEffect } from 'react'
import './App.css'
import { fetchFigmaDesign } from './services/figmaService'
import { generateReactComponents, type GeneratedComponent } from './services/codeGenerator'

import type { FigmaDesign } from './services/figmaService'

function App() {
  const [design, setDesign] = useState<FigmaDesign | null>(null)
  const [generatedComponents, setGeneratedComponents] = useState<GeneratedComponent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [figmaUrl, setFigmaUrl] = useState('https://www.figma.com/design/lOtA03Xi3PW19zkhxzMSKS/CarFlow-project-COPY?node-id=219-39305&m=dev')
  const [accessToken, setAccessToken] = useState('')
  const [activeTab, setActiveTab] = useState<'design' | 'components'>('design')
  const [selectedComponent, setSelectedComponent] = useState<number>(0)

  const handleFetchDesign = async () => {
    if (!figmaUrl.trim()) {
      setError('Please enter a Figma URL or file key')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const token = accessToken || import.meta.env.VITE_FIGMA_TOKEN
      const designData = await fetchFigmaDesign(figmaUrl, token || undefined)
      setDesign(designData)
      
      // Generate React components
      const components = generateReactComponents(designData)
      setGeneratedComponents(components)
      if (components.length > 0) {
        setActiveTab('components')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch design from Figma')
    } finally {
      setLoading(false)
    }
  }

  const downloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleDownloadComponent = (component: GeneratedComponent) => {
    downloadFile(component.code, `${component.name}.tsx`)
    if (component.css) {
      downloadFile(component.css, `${component.name}.css`)
    }
  }

  const handleDownloadAll = () => {
    generatedComponents.forEach(component => {
      handleDownloadComponent(component)
    })
  }

  return (
    <div className="App">
      <h1>CarFlow Frontend</h1>
      <p className="subtitle">Figma Design Integration</p>

      <div className="figma-input-section">
        <div className="input-group">
          <label htmlFor="figma-url">Figma URL:</label>
          <input
            id="figma-url"
            type="text"
            placeholder="Enter Figma URL or File Key"
            value={figmaUrl}
            onChange={(e) => setFigmaUrl(e.target.value)}
            className="figma-input"
          />
        </div>
        <div className="input-group">
          <label htmlFor="access-token">Access Token (optional):</label>
          <input
            id="access-token"
            type="password"
            placeholder="Or set VITE_FIGMA_TOKEN env var"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            className="figma-input"
          />
        </div>
        <button 
          onClick={handleFetchDesign} 
          disabled={loading}
          className="fetch-button"
        >
          {loading ? 'Loading...' : 'Fetch Design'}
        </button>
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {design && (
        <div className="design-section">
          <div className="tabs">
            <button
              className={`tab ${activeTab === 'design' ? 'active' : ''}`}
              onClick={() => setActiveTab('design')}
            >
              Design Data
            </button>
            <button
              className={`tab ${activeTab === 'components' ? 'active' : ''}`}
              onClick={() => setActiveTab('components')}
              disabled={generatedComponents.length === 0}
            >
              React Components ({generatedComponents.length})
            </button>
          </div>

          {activeTab === 'design' && (
            <div className="design-preview">
              <h2>Design: {design.name}</h2>
              <div className="design-info">
                <p>Components: {design.components ? Object.keys(design.components).length : 0}</p>
                <p>Styles: {design.styles ? Object.keys(design.styles).length : 0}</p>
                {design.document && <p>Document: {design.document.name || 'Root'}</p>}
              </div>
              <pre className="design-json">
                {JSON.stringify(design, null, 2)}
              </pre>
            </div>
          )}

          {activeTab === 'components' && generatedComponents.length > 0 && (
            <div className="components-section">
              <div className="components-header">
                <h2>Generated React Components</h2>
                <button
                  onClick={handleDownloadAll}
                  className="download-all-button"
                >
                  Download All
                </button>
              </div>

              <div className="components-list">
                {generatedComponents.map((component, index) => (
                  <div
                    key={index}
                    className={`component-item ${selectedComponent === index ? 'active' : ''}`}
                    onClick={() => setSelectedComponent(index)}
                  >
                    <span className="component-name">{component.name}</span>
                    <span className="component-type">{component.type}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDownloadComponent(component)
                      }}
                      className="download-button"
                    >
                      Download
                    </button>
                  </div>
                ))}
              </div>

              {selectedComponent < generatedComponents.length && (
                <div className="component-preview">
                  <div className="code-tabs">
                    <button className="code-tab active">Component ({generatedComponents[selectedComponent].name}.tsx)</button>
                    {generatedComponents[selectedComponent].css && (
                      <button className="code-tab">Styles ({generatedComponents[selectedComponent].name}.css)</button>
                    )}
                  </div>
                  <div className="code-preview">
                    <div className="code-header">
                      <span>{generatedComponents[selectedComponent].name}.tsx</span>
                      <button
                        onClick={() => handleDownloadComponent(generatedComponents[selectedComponent])}
                        className="copy-button"
                      >
                        Download
                      </button>
                    </div>
                    <pre className="code-content">
                      <code>{generatedComponents[selectedComponent].code}</code>
                    </pre>
                    {generatedComponents[selectedComponent].css && (
                      <>
                        <div className="code-header">
                          <span>{generatedComponents[selectedComponent].name}.css</span>
                          <button
                            onClick={() => {
                              const component = generatedComponents[selectedComponent]
                              if (component.css) {
                                downloadFile(component.css, `${component.name}.css`)
                              }
                            }}
                            className="copy-button"
                          >
                            Download
                          </button>
                        </div>
                        <pre className="code-content">
                          <code>{generatedComponents[selectedComponent].css}</code>
                        </pre>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default App

