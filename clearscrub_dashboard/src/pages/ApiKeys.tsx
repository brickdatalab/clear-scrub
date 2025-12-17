import React, { useState, useEffect } from 'react'
import {
  Plus,
  Copy,
  MoreHorizontal,
  Trash2,
  RotateCcw,
  Check,
  Key as KeyIcon,
  AlertCircle,
  Loader
} from 'lucide-react'
import { api, ApiKey } from '../services/api'
import { useAuth } from '../hooks/useAuth'
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { withTimeout, TIMEOUT_MS } from '../lib/utils'

export default function ApiKeys() {
  const { user } = useAuth()
  const orgId = user?.org_id

  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showKeyModal, setShowKeyModal] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [newGeneratedKey, setNewGeneratedKey] = useState('')
  const [copiedKey, setCopiedKey] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Fetch API keys on mount
  useEffect(() => {
    if (orgId) {
      fetchApiKeys()
    }
  }, [orgId])

  const fetchApiKeys = async () => {
    if (!orgId) {
      setError('Organization ID not found')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const keys = await withTimeout(api.getApiKeys(orgId), TIMEOUT_MS.EDGE_FUNCTION, 'getApiKeys')
      setApiKeys(keys)
    } catch (err: any) {
      console.error('Failed to fetch API keys:', err)
      setError(err.message || 'Failed to load API keys')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateKey = async () => {
    if (!newKeyName.trim() || !orgId) return

    setActionLoading('create')
    setError(null)

    try {
      const { id, key, prefix } = await withTimeout(api.createApiKey(orgId, newKeyName), TIMEOUT_MS.EDGE_FUNCTION, 'createApiKey')

      // Show modal with full key (only shown once!)
      setNewGeneratedKey(key)
      setNewKeyName('')
      setShowCreateModal(false)
      setShowKeyModal(true)

      // Refresh list
      await fetchApiKeys()
    } catch (err: any) {
      console.error('Failed to create API key:', err)
      setError(err.message || 'Failed to create API key')
    } finally {
      setActionLoading(null)
    }
  }

  const handleCopyKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key)
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(''), 2000)
    } catch (err) {
      console.error('Failed to copy key:', err)
    }
  }

  const handleRegenerateKey = async (keyId: string) => {
    setActionLoading(keyId)
    setError(null)
    setDropdownOpen(null)

    try {
      const { key } = await withTimeout(api.regenerateApiKey(keyId), TIMEOUT_MS.EDGE_FUNCTION, 'regenerateApiKey')

      // Show modal with new key
      setNewGeneratedKey(key)
      setShowKeyModal(true)

      // Refresh list
      await fetchApiKeys()
    } catch (err: any) {
      console.error('Failed to regenerate API key:', err)
      setError(err.message || 'Failed to regenerate API key')
    } finally {
      setActionLoading(null)
    }
  }

  const handleRevokeKey = async (keyId: string) => {
    setActionLoading(keyId)
    setError(null)
    setDropdownOpen(null)

    try {
      await withTimeout(api.revokeApiKey(keyId), TIMEOUT_MS.EDGE_FUNCTION, 'revokeApiKey')
      await fetchApiKeys()
    } catch (err: any) {
      console.error('Failed to revoke API key:', err)
      setError(err.message || 'Failed to revoke API key')
    } finally {
      setActionLoading(null)
    }
  }

  const handleDeleteKey = async (keyId: string) => {
    if (!confirm('Are you sure you want to delete this API key? This action cannot be undone.')) {
      return
    }

    setActionLoading(keyId)
    setError(null)
    setDropdownOpen(null)

    try {
      await withTimeout(api.deleteApiKey(keyId), TIMEOUT_MS.EDGE_FUNCTION, 'deleteApiKey')
      await fetchApiKeys()
    } catch (err: any) {
      console.error('Failed to delete API key:', err)
      setError(err.message || 'Failed to delete API key')
    } finally {
      setActionLoading(null)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  }

  // Show loading state
  if (loading) {
    return (
      <div className="space-y-8">
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-4">
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">API Keys</h1>
            <p className="text-sm text-gray-600">
              Manage your API keys to authenticate requests to the ClearScrub API.
              Keep your keys secure and never share them publicly.
            </p>
          </div>
        </div>
        <Card>
          <div className="p-10 text-center">
            <Loader className="animate-spin w-8 h-8 mx-auto mb-4" />
            <p className="text-sm text-gray-600">Loading API keys...</p>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Error Banner */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Page Header */}
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">API Keys</h1>
          <p className="text-sm text-gray-600">
            Manage your API keys to authenticate requests to the ClearScrub API.
            Keep your keys secure and never share them publicly.
          </p>
        </div>
        <Button
          onClick={() => setShowCreateModal(true)}
          disabled={actionLoading === 'create'}
          variant="default"
          
          className="flex items-center gap-2 justify-center"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Create API Key</span>
          <span className="sm:hidden">Create Key</span>
        </Button>
      </div>

      {/* API Keys Table */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Your API Keys</h2>
          <p className="text-sm text-muted-foreground">{apiKeys.length} API keys</p>
        </CardHeader>
        <CardContent>
        {apiKeys.length === 0 ? (
          <div className="p-10 text-center">
            <KeyIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-base font-medium text-gray-900 mb-2">No API keys yet</h3>
            <p className="text-sm text-gray-500 mb-6">
              Create your first API key to start integrating with ClearScrub
            </p>
            <Button
              onClick={() => setShowCreateModal(true)}
              variant="default"
              
              className="flex items-center gap-2 mx-auto"
            >
              <Plus className="w-4 h-4" />
              Create API Key
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-5 py-3 text-sm font-medium text-gray-700">Name</th>
                  <th className="text-left px-5 py-3 text-sm font-medium text-gray-700">Key</th>
                  <th className="text-left px-5 py-3 text-sm font-medium text-gray-700">Status</th>
                  <th className="text-left px-5 py-3 text-sm font-medium text-gray-700">Created</th>
                  <th className="text-left px-5 py-3 text-sm font-medium text-gray-700">Last Used</th>
                  <th className="text-right px-5 py-3 text-sm font-medium text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {apiKeys.map((apiKey) => (
                  <tr key={apiKey.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors duration-150">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-100 rounded flex items-center justify-center">
                          <KeyIcon className="w-4 h-4 text-blue-600" />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{apiKey.key_name}</span>
                          {apiKey.is_default && (
                            <Badge variant="default">Default</Badge>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <code className="font-mono text-sm text-gray-600 bg-gray-100 px-2 py-1 rounded">
                          {apiKey.prefix}...
                        </code>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <Badge variant={apiKey.is_active ? "default" : "secondary"}>
                        {apiKey.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 text-sm">
                      {formatDate(apiKey.created_at)}
                    </td>
                    <td className="px-5 py-4 text-sm">
                      {apiKey.last_used_at ? formatDateTime(apiKey.last_used_at) : 'Never'}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="relative">
                        <Button
                          onClick={() => setDropdownOpen(dropdownOpen === apiKey.id ? null : apiKey.id)}
                          disabled={actionLoading === apiKey.id}
                          variant="ghost"
                          size="icon"
                          aria-label="More options"
                        >
                          {actionLoading === apiKey.id ? (
                            <Loader className="w-4 h-4 animate-spin" />
                          ) : (
                            <MoreHorizontal className="w-4 h-4 text-gray-400" />
                          )}
                        </Button>

                        {dropdownOpen === apiKey.id && (
                          <div className="absolute right-0 top-8 w-48 bg-white border border-gray-200 rounded shadow-lg z-10">
                            <Button
                              onClick={() => handleRegenerateKey(apiKey.id)}
                              variant="ghost"
                              className="w-full justify-start px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 rounded-none"
                            >
                              <RotateCcw className="w-4 h-4" />
                              Regenerate
                            </Button>
                            {apiKey.is_active ? (
                              <Button
                                onClick={() => handleRevokeKey(apiKey.id)}
                                variant="ghost"
                                className="w-full justify-start px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 rounded-none border-t"
                              >
                                <Check className="w-4 h-4" />
                                Revoke
                              </Button>
                            ) : null}
                            {!apiKey.is_default && (
                              <Button
                                onClick={() => handleDeleteKey(apiKey.id)}
                                variant="destructive"
                                className="w-full justify-start px-4 py-2 text-left text-sm hover:bg-red-50 flex items-center gap-2 rounded-none border-t"
                              >
                                <Trash2 className="w-4 h-4" />
                                Delete
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </CardContent>
      </Card>

      {/* Create API Key Modal */}
      <Dialog
        open={showCreateModal}
        onOpenChange={(open) => {
          if (!open) {
            setShowCreateModal(false)
            setNewKeyName('')
            setError(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create API Key</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Key Name
              </label>
              <Input
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="e.g., Production API, Development Testing"
                autoFocus
              />
            </div>
            <Alert>
              <AlertDescription>
                You'll only be able to view this key once. Make sure to copy and store it securely.
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                setShowCreateModal(false)
                setNewKeyName('')
                setError(null)
              }}
              disabled={actionLoading === 'create'}
              variant="secondary"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateKey}
              disabled={!newKeyName.trim() || actionLoading === 'create'}
              variant="default"
              className="flex items-center gap-2"
            >
              {actionLoading === 'create' ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Key'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Show New Key Modal */}
      <Dialog
        open={showKeyModal}
        onOpenChange={(open) => {
          if (!open) {
            setShowKeyModal(false)
            setNewGeneratedKey('')
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Your New API Key</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Alert variant="destructive">
              <AlertDescription>
                This is the only time you'll be able to view this key. Copy it and store it securely.
              </AlertDescription>
            </Alert>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                API Key
              </label>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 bg-gray-100 border border-gray-300 rounded text-sm font-mono break-all">
                  {newGeneratedKey}
                </code>
                <Button
                  onClick={() => handleCopyKey(newGeneratedKey)}
                  variant="secondary"
                  className="flex items-center gap-2 flex-shrink-0"
                >
                  {copiedKey === newGeneratedKey ? (
                    <>
                      <Check className="w-4 h-4" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                setShowKeyModal(false)
                setNewGeneratedKey('')
              }}
              variant="default"
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Click outside to close dropdown */}
      {dropdownOpen && (
        <div 
          className="fixed inset-0 z-0" 
          onClick={() => setDropdownOpen(null)}
        />
      )}
    </div>
  )
}
