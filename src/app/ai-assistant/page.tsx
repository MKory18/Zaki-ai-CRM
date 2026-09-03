'use client';

import React, { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useApp } from '@/context/AppContext';
import {
  Sparkles,
  RefreshCw,
  Send,
  AlertCircle,
  Lightbulb,
  ShieldAlert,
  CheckCircle2,
  TrendingUp,
  DollarSign,
  User,
  Bot,
} from 'lucide-react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  time: string;
}

export default function AiAssistantPage() {
  const { t } = useApp();
  const [summaryData, setSummaryData] = useState<any>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content:
        'Hello! I am your SALESFLOW AI Business Intelligence Advisor. I have real-time access to your company orders, production batches, moderator conversion rates, and delivered net profit ledger. Ask me any question about your business performance.',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  const suggestedQuestions = [
    'How is my business performing today?',
    'What is my most profitable product?',
    'Which moderator has the best performance?',
    'Which product has the highest rejection rate?',
    'Should I increase production of this product?',
  ];

  const loadSummary = async () => {
    setLoadingSummary(true);
    try {
      const res = await fetch('/api/ai/daily-summary');
      if (res.ok) {
        const data = await res.json();
        setSummaryData(data.summary);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingSummary(false);
    }
  };

  const handleGenerateSummary = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/ai/daily-summary', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setSummaryData(data.summary);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setGenerating(false);
    }
  };

  useEffect(() => {
    loadSummary();
  }, []);

  const handleSendMessage = async (textToSend?: string) => {
    const q = textToSend || inputQuery;
    if (!q.trim()) return;

    const userMsg: ChatMessage = {
      role: 'user',
      content: q,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputQuery('');
    setChatLoading(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, period: 'all' }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: data.answer,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      } else {
        throw new Error('Failed to get answer');
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, I encountered an issue querying the analytics service.',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  let observations: string[] = [];
  let risks: string[] = [];
  let recommendations: string[] = [];
  let metrics: any = null;

  if (summaryData) {
    try {
      observations = summaryData.observations ? JSON.parse(summaryData.observations) : [];
      risks = summaryData.risks ? JSON.parse(summaryData.risks) : [];
      recommendations = summaryData.recommendations
        ? JSON.parse(summaryData.recommendations)
        : [];
      metrics = summaryData.metricsJson ? JSON.parse(summaryData.metricsJson) : null;
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center space-x-2">
              <Sparkles className="w-6 h-6 text-red-600" />
              <span>{t.aiAssistant}</span>
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Section 23-26 OpenRouter AI Business Advisor grounded on verified database metrics & zero financial hallucinations
            </p>
          </div>

          <Button
            size="sm"
            onClick={handleGenerateSummary}
            loading={generating}
            className="flex items-center space-x-1.5 bg-red-600 hover:bg-red-700"
          >
            <Sparkles className="w-4 h-4" />
            <span>Regenerate Executive Summary</span>
          </Button>
        </div>

        {/* Section 25: AI Daily Summary Section */}
        {summaryData && (
          <div className="space-y-4">
            {/* Executive Summary Card */}
            <Card className="border-red-100 bg-gradient-to-br from-white via-red-50/20 to-red-50/30">
              <CardHeader
                title={
                  <div className="flex items-center justify-between">
                    <span className="flex items-center space-x-2">
                      <Sparkles className="w-5 h-5 text-red-600" />
                      <span>Executive Daily Briefing ({summaryData.date})</span>
                    </span>
                    <span className="text-xs font-mono font-medium text-slate-400">
                      OpenRouter Model Active
                    </span>
                  </div>
                }
                subtitle="Aggregated business intelligence summary calculated from real orders & production costs"
              />
              <CardContent className="space-y-4">
                <p className="text-sm font-medium text-slate-800 leading-relaxed bg-white/80 p-4 rounded-xl border border-red-100/60 shadow-xs">
                  {summaryData.summaryText}
                </p>

                {/* Ground-truth Metrics Pill Bar */}
                {metrics && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 text-center text-xs">
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-400 block">Orders</span>
                      <strong className="text-slate-900 font-bold">{metrics.total_orders}</strong>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-400 block">Confirmed</span>
                      <strong className="text-red-600 font-bold">{metrics.confirmed_orders}</strong>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-400 block">Delivered</span>
                      <strong className="text-red-600 font-bold">{metrics.delivered_orders}</strong>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-400 block">Delivered Revenue</span>
                      <strong className="text-slate-900 font-bold">${metrics.revenue?.toFixed(2)}</strong>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-400 block">Real Net Profit</span>
                      <strong className="text-red-700 font-black">${metrics.net_profit?.toFixed(2)}</strong>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-400 block">Confirm Rate</span>
                      <strong className="text-red-600 font-bold">{metrics.confirmation_rate}%</strong>
                    </div>
                  </div>
                )}

                {/* 3 Pillars: Observations, Risks, Recommendations */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                  {/* Key Observations */}
                  <div className="bg-red-50/70 border border-red-100 rounded-xl p-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-red-800 flex items-center space-x-1.5 mb-2.5">
                      <Lightbulb className="w-4 h-4 text-red-600" />
                      <span>Key Observations</span>
                    </h4>
                    <ul className="space-y-2 text-xs text-slate-700">
                      {observations.map((obs, i) => (
                        <li key={i} className="flex items-start space-x-1.5">
                          <span className="text-red-500 font-bold">•</span>
                          <span>{obs}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Risks */}
                  <div className="bg-rose-50/70 border border-rose-100 rounded-xl p-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-rose-800 flex items-center space-x-1.5 mb-2.5">
                      <ShieldAlert className="w-4 h-4 text-rose-600" />
                      <span>Operational Risks</span>
                    </h4>
                    <ul className="space-y-2 text-xs text-slate-700">
                      {risks.map((risk, i) => (
                        <li key={i} className="flex items-start space-x-1.5">
                          <span className="text-rose-500 font-bold">•</span>
                          <span>{risk}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Recommendations */}
                  <div className="bg-red-50/70 border border-red-100 rounded-xl p-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-red-800 flex items-center space-x-1.5 mb-2.5">
                      <CheckCircle2 className="w-4 h-4 text-red-600" />
                      <span>Tactical Recommendations</span>
                    </h4>
                    <ul className="space-y-2 text-xs text-slate-700">
                      {recommendations.map((rec, i) => (
                        <li key={i} className="flex items-start space-x-1.5">
                          <span className="text-red-500 font-bold">•</span>
                          <span>{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Section 24: AI Executive Chat Advisor */}
        <Card className="flex flex-col h-[550px]">
          <CardHeader
            title={<span className="flex items-center space-x-2"><Bot className="w-5 h-5 text-red-600" /><span>AI Executive Chat Advisor (Section 24)</span></span>}
            subtitle="Ask strategic questions; AI calculates responses from live verified database context"
          />

          {/* Chat Messages */}
          <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`flex items-start space-x-3 rtl:space-x-reverse ${
                  m.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {m.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-full bg-red-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div
                  className={`max-w-xl rounded-2xl px-4 py-3 text-xs leading-relaxed shadow-xs ${
                    m.role === 'user'
                      ? 'bg-red-600 text-white rounded-tr-none'
                      : 'bg-slate-100 text-slate-800 rounded-tl-none whitespace-pre-wrap'
                  }`}
                >
                  <p>{m.content}</p>
                  <span
                    className={`text-[9px] block mt-1 text-right ${
                      m.role === 'user' ? 'text-red-100' : 'text-slate-400'
                    }`}
                  >
                    {m.time}
                  </span>
                </div>

                {m.role === 'user' && (
                  <div className="w-8 h-8 rounded-full bg-red-100 text-red-700 flex items-center justify-center shrink-0 font-bold text-xs">
                    U
                  </div>
                )}
              </div>
            ))}

            {chatLoading && (
              <div className="flex items-center space-x-2 text-xs text-slate-400">
                <Bot className="w-4 h-4 text-red-600 animate-spin" />
                <span>SALESFLOW AI is analyzing live business metrics...</span>
              </div>
            )}
          </CardContent>

          {/* Quick Prompts Bar */}
          <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex items-center space-x-2 rtl:space-x-reverse overflow-x-auto text-[11px]">
            <span className="text-slate-400 shrink-0 font-medium">Try asking:</span>
            {suggestedQuestions.map((sq, i) => (
              <button
                key={i}
                onClick={() => handleSendMessage(sq)}
                className="shrink-0 px-2.5 py-1 rounded-full bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition-colors cursor-pointer"
              >
                {sq}
              </button>
            ))}
          </div>

          {/* Input Bar */}
          <div className="p-3 border-t border-slate-200 bg-white">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center space-x-2 rtl:space-x-reverse"
            >
              <input
                type="text"
                placeholder="Ask about revenue, top profitable products, moderator performance, or production advice..."
                value={inputQuery}
                onChange={(e) => setInputQuery(e.target.value)}
                className="flex-1 px-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
              />
              <Button type="submit" size="sm" loading={chatLoading} className="bg-red-600 hover:bg-red-700">
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
