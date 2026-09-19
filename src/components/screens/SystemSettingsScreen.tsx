'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { useApp } from '@/context/AppContext';
import { Settings, Building2, Key, Webhook, ShieldCheck, Check } from 'lucide-react';

export function SystemSettingsScreen() {
  const { t } = useApp();
  const [company, setCompany] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Form Fields
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [country, setCountry] = useState('Egypt');
  const [defaultShippingCost, setDefaultShippingCost] = useState(5.0);
  const [defaultCommission, setDefaultCommission] = useState(5.0);
  const [openRouterModel, setOpenRouterModel] = useState('meta-llama/llama-3.3-70b-instruct:free');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        setCompany(data.company);
        setName(data.company.name || '');
        setCurrency(data.company.currency || 'USD');
        setCountry(data.company.country || 'Egypt');
        if (data.company.settings) {
          setDefaultShippingCost(data.company.settings.defaultShippingCost || 5.0);
          setDefaultCommission(data.company.settings.defaultCommission || 5.0);
          setOpenRouterModel(
            data.company.settings.openRouterModel || 'meta-llama/llama-3.3-70b-instruct:free'
          );
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedSuccess(false);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          currency,
          country,
          settings: {
            defaultShippingCost,
            defaultCommission,
            openRouterModel,
          },
        }),
      });

      if (res.ok) {
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 3000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="space-y-6 max-w-4xl">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#121926] flex items-center space-x-2">
            <Settings className="w-6 h-6 text-[#364152]" />
            <span>{t.settings}</span>
          </h1>
          <p className="text-xs text-[#697586] mt-1">
            Section 1 Multi-Tenant Organization, OpenRouter AI Model & Automation Endpoints
          </p>
        </div>

        {savedSuccess && (
          <div className="p-3 bg-[#feecee] border border-[#f5c6cb] text-[#fb323f] text-xs rounded-xl flex items-center space-x-2">
            <Check className="w-4 h-4 text-[#fb323f]" />
            <span>Settings saved successfully!</span>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-6">
          {/* Company Profile */}
          <Card>
            <CardHeader
              title={<span className="flex items-center space-x-2"><Building2 className="w-4 h-4 text-[#fb323f]" /><span>Organization Profile & Currency</span></span>}
              subtitle="Company tenancy settings"
            />
            <CardContent className="space-y-4">
              <Input
                label="Company Name *"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Select
                  label="Operational Currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                >
                  <option value="USD">USD ($ - US Dollar)</option>
                  <option value="EGP">EGP (Eآ£ - Egyptian Pound)</option>
                  <option value="SAR">SAR (ï·¼ - Saudi Riyal)</option>
                  <option value="AED">AED (د.إ - UAE Dirham)</option>
                </Select>

                <Input
                  label="Country of Operation"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Default Standard Shipping Cost ($)"
                  type="number"
                  step="0.5"
                  value={defaultShippingCost}
                  onChange={(e) => setDefaultShippingCost(parseFloat(e.target.value) || 0)}
                />

                <Input
                  label="Default Moderator Commission Rate (%)"
                  type="number"
                  step="0.5"
                  value={defaultCommission}
                  onChange={(e) => setDefaultCommission(parseFloat(e.target.value) || 0)}
                />
              </div>
            </CardContent>
          </Card>

          {/* OpenRouter AI Integration */}
          <Card>
            <CardHeader
              title={<span className="flex items-center space-x-2"><Key className="w-4 h-4 text-[#fb323f]" /><span>OpenRouter AI Integration (Section 26)</span></span>}
              subtitle="Configures the Business Intelligence LLM engine"
            />
            <CardContent className="space-y-4">
              <Select
                label="OpenRouter Intelligence Model"
                value={openRouterModel}
                onChange={(e) => setOpenRouterModel(e.target.value)}
              >
                <option value="meta-llama/llama-3.3-70b-instruct:free">
                  Llama 3.3 70B Instruct (Free / Production Grade)
                </option>
                <option value="deepseek/deepseek-r1:free">DeepSeek R1 (Reasoning Free)</option>
                <option value="anthropic/claude-3.5-sonnet">Claude 3.5 Sonnet (High Accuracy)</option>
                <option value="openai/gpt-4o-mini">OpenAI GPT-4o-mini (Cost Optimized)</option>
              </Select>

              <div className="p-3 bg-[#f8fafc] border border-[#e3e8ef] rounded-xl text-xs text-[#364152] space-y-1">
                <p className="font-semibold text-[#121926]">Security & Environment Isolation:</p>
                <p>
                  API keys are strictly managed via server environment variable{' '}
                  <code className="bg-[#e8eaef] px-1 py-0.5 rounded font-mono text-[11px]">
                    OPENROUTER_API_KEY
                  </code>{' '}
                  and never exposed to client-side scripts.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* n8n Automation Ready Endpoints */}
          <Card>
            <CardHeader
              title={<span className="flex items-center space-x-2"><Webhook className="w-4 h-4 text-[#fb323f]" /><span>Automation & n8n Integration Webhooks</span></span>}
              subtitle="Ready-to-connect webhooks for social ad leads & delivery couriers"
            />
            <CardContent className="space-y-3 text-xs">
              <div className="p-3 bg-[#f8fafc] rounded-lg border border-[#e3e8ef]">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#121926]">New Order Ingestion Webhook:</span>
                  <span className="bg-[#feecee] text-[#fb323f] font-bold px-2 py-0.5 rounded text-[10px]">
                    READY
                  </span>
                </div>
                <p className="font-mono text-[#697586] mt-1 text-[11px]">
                  POST /api/orders (Accepts JSON leads from Facebook Lead Ads, TikTok, Shopify, or n8n)
                </p>
              </div>

              <div className="p-3 bg-[#f8fafc] rounded-lg border border-[#e3e8ef]">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#121926]">Courier Tracking Webhook:</span>
                  <span className="bg-[#feecee] text-[#fb323f] font-bold px-2 py-0.5 rounded text-[10px]">
                    READY
                  </span>
                </div>
                <p className="font-mono text-[#697586] mt-1 text-[11px]">
                  PATCH /api/orders/:id (Accepts automated status changes: SHIPPED, DELIVERED, RETURNED)
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Submit */}
          <div className="flex justify-end">
            <Button type="submit" loading={saving} size="md">
              Save Settings
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
