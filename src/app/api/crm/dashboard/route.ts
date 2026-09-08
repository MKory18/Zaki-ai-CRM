// CRM Dashboard — KPIs, deals by stage, revenue by month, top deals, upcoming tasks, recent activity
import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { requirePermission } from '@/lib/authorization';

const STAGES = ['NEW', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'];

export async function GET(_req: Request) {
  try {
    const { companyId } = await requireCompanyTenant();
    await requirePermission('crm.view');

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const [
      totalContacts,
      totalCompanies,
      openLeads,
      openDeals,
      tasksDueToday,
      overdueTasks,
      stageGroups,
      wonGroup,
      lostGroup,
      recentInvoices,
      topOpenDeals,
      upcomingTasks,
      recentActivities,
      leadStatusGroups,
    ] = await Promise.all([
      db.crmContact.count({ where: { companyId } }),
      db.crmCompany.count({ where: { companyId } }),
      db.crmLead.count({ where: { companyId, status: { in: ['NEW', 'CONTACTED', 'QUALIFIED'] } } }),
      db.crmDeal.count({ where: { companyId, stage: { notIn: ['WON', 'LOST'] } } }),
      db.crmTask.count({ where: { companyId, status: { in: ['TODO', 'IN_PROGRESS'] }, dueDate: { gte: todayStart, lt: todayEnd } } }),
      db.crmTask.count({ where: { companyId, status: { in: ['TODO', 'IN_PROGRESS'] }, dueDate: { lt: todayStart } } }),
      db.crmDeal.groupBy({ by: ['stage'], where: { companyId }, _count: { _all: true }, _sum: { value: true } }),
      db.crmDeal.aggregate({ where: { companyId, stage: 'WON' }, _sum: { value: true }, _count: { _all: true } }),
      db.crmDeal.aggregate({ where: { companyId, stage: 'LOST' }, _count: { _all: true } }),
      db.crmInvoice.findMany({
        where: { companyId, issueDate: { gte: sixMonthsAgo }, status: { not: 'CANCELLED' } },
        select: { issueDate: true, total: true },
      }),
      db.crmDeal.findMany({
        where: { companyId, stage: { notIn: ['WON', 'LOST'] } },
        include: {
          crmContact: { select: { id: true, firstName: true, lastName: true } },
          crmCompany: { select: { id: true, name: true } },
        },
        orderBy: { value: 'desc' },
        take: 5,
      }),
      db.crmTask.findMany({
        where: { companyId, status: { notIn: ['DONE', 'CANCELLED'] } },
        include: {
          assignedTo: { select: { id: true, name: true } },
          crmContact: { select: { id: true, firstName: true, lastName: true } },
          crmDeal: { select: { id: true, title: true } },
        },
        orderBy: { dueDate: 'asc' },
        take: 5,
      }),
      db.crmActivity.findMany({
        where: { companyId },
        include: {
          user: { select: { id: true, name: true } },
          crmContact: { select: { id: true, firstName: true, lastName: true } },
          crmDeal: { select: { id: true, title: true } },
          crmLead: { select: { id: true, name: true } },
        },
        orderBy: { occurredAt: 'desc' },
        take: 10,
      }),
      db.crmLead.groupBy({ by: ['status'], where: { companyId }, _count: { _all: true } }),
    ]);

    const openDealsAgg = await db.crmDeal.aggregate({
      where: { companyId, stage: { notIn: ['WON', 'LOST'] } },
      _sum: { value: true },
    });

    // Deals grouped by stage, always covering all 6 stages
    const dealsByStage = STAGES.map((stage) => {
      const group = stageGroups.find((g) => g.stage === stage);
      return { stage, count: group?._count._all || 0, value: group?._sum.value || 0 };
    });

    // Revenue by month for the last 6 months: WON deals + invoiced totals
    const revenueByMonth: { month: string; won: number; invoiced: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;

      const wonDeals = await db.crmDeal.aggregate({
        where: { companyId, stage: 'WON', closedAt: { gte: start, lt: end } },
        _sum: { value: true },
      });
      const invoiced = recentInvoices
        .filter((inv) => inv.issueDate >= start && inv.issueDate < end)
        .reduce((sum, inv) => sum + inv.total, 0);

      revenueByMonth.push({ month: key, won: wonDeals._sum.value || 0, invoiced });
    }

    return NextResponse.json({
      kpis: {
        totalContacts,
        totalCompanies,
        openLeads,
        openDeals,
        pipelineValue: openDealsAgg._sum.value || 0,
        wonValue: wonGroup._sum.value || 0,
        wonCount: wonGroup._count._all,
        lostCount: lostGroup._count._all,
        tasksDueToday,
        overdueTasks,
      },
      dealsByStage,
      leadsByStatus: ['NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'CONVERTED'].map((status) => ({
        status,
        count: leadStatusGroups.find((g) => g.status === status)?._count._all || 0,
      })),
      revenueByMonth,
      topOpenDeals,
      upcomingTasks,
      recentActivities,
    });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}
