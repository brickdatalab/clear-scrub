import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Building2,
  Users,
  BarChart3,
  Shield,
  CreditCard,
  Edit,
  Plus,
  Download,
  ChevronDown,
  Check,
  X,
  AlertCircle
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabaseClient';
import type { Organization } from '../types/auth';

const Settings: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();

  // Organization data state
  const [orgData, setOrgData] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Edit mode for organization name
  const [isEditingOrgName, setIsEditingOrgName] = useState(false);
  const [editedOrgName, setEditedOrgName] = useState('');

  // Get active tab from URL or default to organization
  const getActiveTab = () => {
    const path = location.pathname;
    if (path.includes('/settings/quota')) return 'quota';
    if (path.includes('/settings/suppressions')) return 'suppressions';
    if (path.includes('/settings/billing')) return 'billing';
    return 'organization';
  };

  const [activeTab, setActiveTab] = useState(getActiveTab());
  const [activeBillingSection, setActiveBillingSection] = useState('pricing');

  // State suppressions
  const [stateSuppressions, setStateSuppressions] = useState<string[]>([]);
  const [newState, setNewState] = useState('');

  // Industry suppressions
  const [industrySuppressions, setIndustrySuppressions] = useState<string[]>([]);
  const [newIndustry, setNewIndustry] = useState('');

  /**
   * Fetch organization data from Supabase
   */
  const fetchOrgData = async () => {
    if (!user?.org_id) {
      setError('No organization ID found');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', user.org_id)
        .single();

      if (fetchError) {
        throw new Error(fetchError.message);
      }

      if (!data) {
        throw new Error('Organization not found');
      }

      setOrgData(data);
      setEditedOrgName(data.name);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load organization data';
      setError(errorMessage);
      console.error('[Settings] Failed to fetch organization:', err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Update organization name
   */
  const handleUpdateOrgName = async () => {
    if (!user?.org_id || !editedOrgName.trim()) {
      setError('Organization name cannot be empty');
      return;
    }

    setError(null);
    setSuccess(null);

    try {
      const { error: updateError } = await supabase
        .from('organizations')
        .update({ name: editedOrgName.trim() })
        .eq('id', user.org_id);

      if (updateError) {
        throw new Error(updateError.message);
      }

      // Refresh organization data
      await fetchOrgData();
      setSuccess('Organization name updated successfully');
      setIsEditingOrgName(false);

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update organization name';
      setError(errorMessage);
      console.error('[Settings] Failed to update organization name:', err);
    }
  };

  /**
   * Copy text to clipboard
   */
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setSuccess('Copied to clipboard');
      setTimeout(() => setSuccess(null), 2000);
    } catch (err) {
      console.error('[Settings] Failed to copy to clipboard:', err);
    }
  };

  // Fetch organization data when user is available
  useEffect(() => {
    if (user?.org_id) {
      fetchOrgData();
    }
  }, [user?.org_id]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    navigate(`/settings/${tab === 'organization' ? '' : tab}`);
  };

  const addStateSuppression = () => {
    if (newState.trim() && !stateSuppressions.includes(newState.trim())) {
      setStateSuppressions([...stateSuppressions, newState.trim()]);
      setNewState('');
    }
  };

  const removeStateSuppression = (state: string) => {
    setStateSuppressions(stateSuppressions.filter(s => s !== state));
  };

  const addIndustrySuppression = () => {
    if (newIndustry.trim() && !industrySuppressions.includes(newIndustry.trim())) {
      setIndustrySuppressions([...industrySuppressions, newIndustry.trim()]);
      setNewIndustry('');
    }
  };

  const removeIndustrySuppression = (industry: string) => {
    setIndustrySuppressions(industrySuppressions.filter(i => i !== industry));
  };

  // Loading state
  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-14 text-gray-600">Loading settings...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (!orgData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <h2 className="text-20 font-semibold text-gray-900 mb-2">Organization Not Found</h2>
          <p className="text-14 text-gray-600 mb-4">{error || 'Unable to load organization data'}</p>
          <button
            onClick={() => fetchOrgData()}
            className="px-4 py-2 bg-primary-600 text-white text-14 font-medium rounded-6 hover:bg-primary-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const renderOrganizationTab = () => (
    <div className="space-y-8">
      {/* Success/Error Messages */}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-6 flex items-center gap-2">
          <Check className="w-5 h-5" />
          <span className="text-14">{success}</span>
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-6 flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          <span className="text-14">{error}</span>
        </div>
      )}

      {/* Company Information */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-24 font-bold text-gray-900">Organization Information</h2>
            <p className="text-14 text-gray-600 mt-1">Manage your organization details and settings</p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <label className="block text-13 font-medium text-gray-700 mb-2">Organization ID</label>
            <div className="flex items-center gap-2">
              <span className="text-14 text-gray-900 font-mono">{orgData.id}</span>
              <button
                onClick={() => copyToClipboard(orgData.id)}
                className="text-primary-600 hover:text-primary-700"
                title="Copy to clipboard"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
          </div>
          <div>
            <label className="block text-13 font-medium text-gray-700 mb-2">Organization Name</label>
            {isEditingOrgName ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={editedOrgName}
                  onChange={(e) => setEditedOrgName(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-6 text-14 focus:outline-none focus:ring-3 focus:ring-primary-600/10 focus:border-primary-600"
                  autoFocus
                />
                <button
                  onClick={handleUpdateOrgName}
                  className="px-3 py-2 bg-primary-600 text-white text-14 font-medium rounded-6 hover:bg-primary-700"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setIsEditingOrgName(false);
                    setEditedOrgName(orgData.name);
                  }}
                  className="px-3 py-2 border border-gray-300 text-14 font-medium rounded-6 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-14 text-gray-900">{orgData.name}</span>
                <button
                  onClick={() => setIsEditingOrgName(true)}
                  className="text-gray-400 hover:text-gray-600"
                  title="Edit organization name"
                >
                  <Edit className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mt-4">
          <div>
            <label className="block text-13 font-medium text-gray-700 mb-2">User Email</label>
            <span className="text-14 text-gray-900">{user?.email || 'N/A'}</span>
          </div>
          <div>
            <label className="block text-13 font-medium text-gray-700 mb-2">Account Created</label>
            <span className="text-14 text-gray-900">
              {new Date(orgData.created_at).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </span>
          </div>
        </div>
      </section>

      {/* Coming Soon Notice */}
      <section className="bg-blue-50 border border-blue-200 rounded-8 p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
          <div>
            <h3 className="text-16 font-semibold text-gray-900 mb-2">Additional Features Coming Soon</h3>
            <ul className="space-y-1 text-14 text-gray-700">
              <li>• Team member management (invitations, roles, permissions)</li>
              <li>• Organization metadata customization</li>
              <li>• API key management</li>
              <li>• Email notification preferences</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );

  const renderQuotaTab = () => (
    <div className="space-y-8">
      <div>
        <h2 className="text-24 font-bold text-gray-900 mb-2">Quota Management</h2>
        <p className="text-14 text-gray-600">View usage analytics and manage processing limits</p>
      </div>

      {/* Coming Soon Notice */}
      <section className="bg-blue-50 border border-blue-200 rounded-8 p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
          <div>
            <h3 className="text-16 font-semibold text-gray-900 mb-2">Usage Tracking Coming Soon</h3>
            <p className="text-14 text-gray-700">
              We're working on comprehensive usage analytics including PDF processing counts, API call metrics,
              storage usage, and historical trends. Check back soon for detailed usage insights.
            </p>
          </div>
        </div>
      </section>
    </div>
  );

  const renderSuppressionsTab = () => (
    <div className="space-y-8">
      <div>
        <h2 className="text-24 font-bold text-gray-900 mb-2">Suppressions</h2>
        <p className="text-14 text-gray-600">Control which submissions are excluded from processing</p>
      </div>

      {/* Coming Soon Notice */}
      <section className="bg-blue-50 border border-blue-200 rounded-8 p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
          <div>
            <h3 className="text-16 font-semibold text-gray-900 mb-2">Email Suppression Management Coming Soon</h3>
            <p className="text-14 text-gray-700">
              Configure state and industry-based suppression rules to automatically filter submissions.
              This feature will be available once email ingestion is fully deployed.
            </p>
          </div>
        </div>
      </section>
    </div>
  );

  const renderBillingTab = () => (
    <div className="flex gap-8">
      {/* Left Sidebar for Billing */}
      <div className="w-48 flex-shrink-0">
        <nav className="space-y-1">
          {[
            { id: 'pricing', label: 'Pricing', icon: CreditCard },
            { id: 'usage', label: 'Usage', icon: BarChart3 },
            { id: 'invoices', label: 'Invoices', icon: Download }
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveBillingSection(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 text-14 font-medium rounded-6 text-left ${
                activeBillingSection === item.id
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Main Billing Content */}
      <div className="flex-1">
        {activeBillingSection === 'pricing' && (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-24 font-bold text-gray-900">Pricing</h2>
                <p className="text-14 text-gray-600">Manage your subscription and billing</p>
              </div>
            </div>

            {/* Coming Soon Notice */}
            <section className="bg-blue-50 border border-blue-200 rounded-8 p-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <h3 className="text-16 font-semibold text-gray-900 mb-2">Billing Configuration Coming Soon</h3>
                  <p className="text-14 text-gray-700">
                    Subscription management, payment method configuration, and plan upgrades will be available shortly.
                    For immediate billing assistance, please contact{' '}
                    <a
                      href="mailto:teams@clearscrub.io"
                      className="text-primary-600 hover:text-primary-700 font-medium"
                    >
                      teams@clearscrub.io
                    </a>
                  </p>
                </div>
              </div>
            </section>

            {/* Plans for Reference */}
            <section>
              <h3 className="text-16 font-semibold text-gray-900 mb-6">Available Plans</h3>
              <div className="grid md:grid-cols-3 gap-6">
                {/* Pay-As-You-Go */}
                <div className="border border-primary-200 rounded-8 p-6 bg-primary-50 flex flex-col">
                  <div className="mb-4">
                    <h4 className="text-16 font-semibold text-gray-900">Pay-As-You-Go</h4>
                    <div className="mt-2">
                      <span className="text-32 font-bold text-gray-900">$0.50</span>
                      <span className="text-14 text-gray-600">/credit</span>
                    </div>
                    <p className="text-13 text-gray-600 mt-1">Base plan with flexible usage</p>
                  </div>
                  <ul className="space-y-2 mb-6 flex-1">
                    <li className="flex items-center gap-2 text-13 text-gray-700">
                      <Check className="w-4 h-4 text-green-600" />
                      $0.50 per credit
                    </li>
                    <li className="flex items-center gap-2 text-13 text-gray-700">
                      <Check className="w-4 h-4 text-green-600" />
                      $25 minimum purchase
                    </li>
                    <li className="flex items-center gap-2 text-13 text-gray-700">
                      <Check className="w-4 h-4 text-green-600" />
                      API access
                    </li>
                    <li className="flex items-center gap-2 text-13 text-gray-700">
                      <Check className="w-4 h-4 text-green-600" />
                      Email support
                    </li>
                  </ul>
                </div>

                {/* Pro Plan */}
                <div className="border border-primary-600 rounded-8 p-6 relative flex flex-col">
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <span className="bg-primary-600 text-white px-3 py-1 rounded-full text-12 font-medium">
                      Recommended
                    </span>
                  </div>
                  <div className="mb-4">
                    <h4 className="text-16 font-semibold text-gray-900">Pro Plan</h4>
                    <div className="mt-2">
                      <span className="text-32 font-bold text-gray-900">$299</span>
                      <span className="text-14 text-gray-600">/month</span>
                    </div>
                    <p className="text-13 text-gray-600 mt-1">20% off Pay-as-you-go</p>
                  </div>
                  <ul className="space-y-2 mb-6 flex-1">
                    <li className="flex items-center gap-2 text-13 text-gray-700">
                      <Check className="w-4 h-4 text-green-600" />
                      750 credits included
                    </li>
                    <li className="flex items-center gap-2 text-13 text-gray-700">
                      <Check className="w-4 h-4 text-green-600" />
                      $0.40 per overage credit
                    </li>
                    <li className="flex items-center gap-2 text-13 text-gray-700">
                      <Check className="w-4 h-4 text-green-600" />
                      Full API access
                    </li>
                    <li className="flex items-center gap-2 text-13 text-gray-700">
                      <Check className="w-4 h-4 text-green-600" />
                      Priority support
                    </li>
                    <li className="flex items-center gap-2 text-13 text-gray-700">
                      <Check className="w-4 h-4 text-green-600" />
                      Webhooks
                    </li>
                  </ul>
                </div>

                {/* Elite Plan */}
                <div className="border border-gray-200 rounded-8 p-6 flex flex-col">
                  <div className="mb-4">
                    <h4 className="text-16 font-semibold text-gray-900">Elite Plan</h4>
                    <div className="mt-2">
                      <span className="text-32 font-bold text-gray-900">$999</span>
                      <span className="text-14 text-gray-600">/month</span>
                    </div>
                    <p className="text-13 text-gray-600 mt-1">30% off Pay-as-you-go</p>
                  </div>
                  <ul className="space-y-2 mb-6 flex-1">
                    <li className="flex items-center gap-2 text-13 text-gray-700">
                      <Check className="w-4 h-4 text-green-600" />
                      2,855 credits included
                    </li>
                    <li className="flex items-center gap-2 text-13 text-gray-700">
                      <Check className="w-4 h-4 text-green-600" />
                      $0.35 per overage credit
                    </li>
                    <li className="flex items-center gap-2 text-13 text-gray-700">
                      <Check className="w-4 h-4 text-green-600" />
                      Full API access
                    </li>
                    <li className="flex items-center gap-2 text-13 text-gray-700">
                      <Check className="w-4 h-4 text-green-600" />
                      Dedicated support
                    </li>
                    <li className="flex items-center gap-2 text-13 text-gray-700">
                      <Check className="w-4 h-4 text-green-600" />
                      Custom integrations
                    </li>
                    <li className="flex items-center gap-2 text-13 text-gray-700">
                      <Check className="w-4 h-4 text-green-600" />
                      SLA guarantee
                    </li>
                  </ul>
                </div>
              </div>

              {/* Contact for High Volume */}
              <div className="mt-8 text-center">
                <p className="text-14 text-gray-600">
                  Planning on more than 10,000 PDFs per month?{' '}
                  <a
                    href="mailto:teams@clearscrub.io"
                    className="text-primary-600 hover:text-primary-700 font-medium"
                  >
                    Contact our team at teams@clearscrub.io
                  </a>
                </p>
              </div>
            </section>
          </div>
        )}

        {activeBillingSection === 'usage' && (
          <div className="space-y-8">
            <div>
              <h2 className="text-24 font-bold text-gray-900">Usage</h2>
              <p className="text-14 text-gray-600">Track your PDF processing and API usage</p>
            </div>

            {/* Coming Soon Notice */}
            <section className="bg-blue-50 border border-blue-200 rounded-8 p-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <h3 className="text-16 font-semibold text-gray-900 mb-2">Usage Analytics Coming Soon</h3>
                  <p className="text-14 text-gray-700">
                    Detailed usage metrics and historical charts will be available shortly. For current usage questions,
                    contact{' '}
                    <a
                      href="mailto:teams@clearscrub.io"
                      className="text-primary-600 hover:text-primary-700 font-medium"
                    >
                      teams@clearscrub.io
                    </a>
                  </p>
                </div>
              </div>
            </section>
          </div>
        )}

        {activeBillingSection === 'invoices' && (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-24 font-bold text-gray-900">Invoices</h2>
                <p className="text-14 text-gray-600">Download and manage your billing history</p>
              </div>
            </div>

            {/* Coming Soon Notice */}
            <section className="bg-blue-50 border border-blue-200 rounded-8 p-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <h3 className="text-16 font-semibold text-gray-900 mb-2">Invoice History Coming Soon</h3>
                  <p className="text-14 text-gray-700">
                    Downloadable invoices and billing history will be available shortly. For invoice requests,
                    contact{' '}
                    <a
                      href="mailto:teams@clearscrub.io"
                      className="text-primary-600 hover:text-primary-700 font-medium"
                    >
                      teams@clearscrub.io
                    </a>
                  </p>
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );

  const tabs = [
    { id: 'organization', label: 'Organization', icon: Building2 },
    { id: 'quota', label: 'Quota', icon: BarChart3 },
    { id: 'suppressions', label: 'Suppressions', icon: Shield },
    { id: 'billing', label: 'Billing', icon: CreditCard }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-32 font-bold text-gray-900">Settings</h1>
          <p className="text-14 text-gray-600 mt-1">Manage your account settings, billing, security, and integrations.</p>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-gray-200 mb-8">
          <nav className="flex space-x-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-14 ${
                  activeTab === tab.id
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="bg-white rounded-8 shadow-sm p-8">
          {activeTab === 'organization' && renderOrganizationTab()}
          {activeTab === 'quota' && renderQuotaTab()}
          {activeTab === 'suppressions' && renderSuppressionsTab()}
          {activeTab === 'billing' && renderBillingTab()}
        </div>
      </div>
    </div>
  );
};

export default Settings;
