'use client';

import React, { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { useApp } from '@/context/AppContext';
import { Headphones, Plus, Award, CheckCircle, Percent, DollarSign, UserCheck } from 'lucide-react';

export default function ModeratorsPage() {
  const { t } = useApp();
  const [moderators, setModerators] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [commissionRate, setCommissionRate] = useState(5.0);
  const [password, setPassword] = useState('password123');
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const loadModerators = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/moderators');
      if (res.ok) {
        const data = await res.json();
        setModerators(data.moderators || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadModerators();
  }, []);

  const handleCreateModerator = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalLoading(true);
    setModalError(null);
    try {
      const res = await fetch('/api/moderators', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone, commissionRate, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setCreateModalOpen(false);
      setName('');
      setEmail('');
      setPhone('');
      loadModerators();
    } catch (err: any) {
      setModalError(err.message);
    } finally {
      setModalLoading(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#121926]">{t.moderators}</h1>
            <p className="text-xs text-[#697586] mt-1">
              Section 15 Sales agents, call confirmation rates, order delivery conversions & commission tracking
            </p>
          </div>

          <Button
            size="sm"
            onClick={() => setCreateModalOpen(true)}
            className="flex items-center space-x-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Add Sales Moderator</span>
          </Button>
        </div>

        {/* Section 15 Moderator Leaderboard Table */}
        <Card>
          <CardHeader
            title={<span className="flex items-center space-x-2"><Award className="w-5 h-5 text-[#fb323f]" /><span>Moderator Performance Leaderboard</span></span>}
            subtitle="Ranked by total confirmed volume, conversion efficiency & delivered sales"
          />
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left rtl:text-right text-xs">
                <thead className="bg-[#f8fafc] border-b border-[#e3e8ef] text-[#697586] font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-3.5">Rank & Agent</th>
                    <th className="px-6 py-3.5">Assigned Orders</th>
                    <th className="px-6 py-3.5">Confirmed</th>
                    <th className="px-6 py-3.5">Delivered</th>
                    <th className="px-6 py-3.5">Confirmation Rate</th>
                    <th className="px-6 py-3.5">Delivery Rate</th>
                    <th className="px-6 py-3.5">Delivered Sales</th>
                    <th className="px-6 py-3.5">Commission Earned</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e3e8ef]">
                  {moderators.map((m, idx) => (
                    <tr key={m.id} className="hover:bg-[#f8fafc] transition-colors">
                      <td className="px-6 py-3.5">
                        <div className="flex items-center space-x-3 rtl:space-x-reverse">
                          <span className={`w-6 h-6 rounded-full font-bold text-xs flex items-center justify-center ${
                            idx === 0 ? 'bg-amber-100 text-amber-800' : idx === 1 ? 'bg-[#e8eaef] text-[#121926]' : 'bg-[#f8fafc] text-[#364152]'
                          }`}>
                            {idx + 1}
                          </span>
                          <div>
                            <p className="font-bold text-[#121926] text-sm">{m.name}</p>
                            <p className="text-[11px] text-[#9ca3af]">{m.email}</p>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-3.5 font-bold text-[#121926]">
                        {m.stats.totalOrders}
                      </td>

                      <td className="px-6 py-3.5 font-bold text-[#fb323f]">
                        {m.stats.confirmedOrders}
                      </td>

                      <td className="px-6 py-3.5 font-bold text-[#fb323f]">
                        {m.stats.deliveredOrders}
                      </td>

                      <td className="px-6 py-3.5">
                        <span className="font-black text-[#fb323f] bg-[#feecee] px-2.5 py-1 rounded-md text-xs">
                          {m.stats.confirmationRate}%
                        </span>
                      </td>

                      <td className="px-6 py-3.5">
                        <span className="font-bold text-[#fb323f] bg-[#feecee] px-2 py-0.5 rounded-md text-xs">
                          {m.stats.deliveryRate}%
                        </span>
                      </td>

                      <td className="px-6 py-3.5 font-bold text-[#121926]">
                        ${m.stats.sales.toFixed(2)}
                      </td>

                      <td className="px-6 py-3.5 font-bold text-[#fb323f]">
                        ${m.stats.commissions.toFixed(2)}{' '}
                        <span className="text-[10px] text-[#9ca3af] font-normal">
                          ({m.commissionRate}%)
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Add Moderator Modal */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Add Sales Moderator"
        subtitle="Creates credentials with isolated moderator order view and commission structure"
      >
        <form onSubmit={handleCreateModerator} className="space-y-4">
          {modalError && (
            <div className="p-3 bg-[#feecee] border border-[#f5c6cb] text-[#fb323f] text-xs rounded-lg">
              {modalError}
            </div>
          )}

          <Input
            label="Full Name *"
            placeholder="e.g. Sara Mahmoud"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Email Address *"
              type="email"
              placeholder="sara@bioderma.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              label="Phone Number"
              placeholder="01100000001"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Commission Rate (%)"
              type="number"
              step="0.5"
              value={commissionRate}
              onChange={(e) => setCommissionRate(parseFloat(e.target.value) || 0)}
              required
            />
            <Input
              label="Default Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div className="flex justify-end space-x-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setCreateModalOpen(false)}>
              {t.cancel}
            </Button>
            <Button type="submit" loading={modalLoading}>
              Save Moderator
            </Button>
          </div>
        </form>
      </Modal>
    </AppLayout>
  );
}
