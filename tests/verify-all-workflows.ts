import { db } from '../src/lib/db';
import { calculateBatchCosts, calculateRealProfit } from '../src/lib/financial';
import { normalizePhoneNumber } from '../src/lib/phone';
import { generateAiBusinessAnalysis } from '../src/lib/ai';
import { getCompanyAnalytics } from '../src/lib/analytics';

async function runVerification() {
  console.log('🧪 Starting SALESFLOW End-to-End Workflow Verification...');

  // 1. Get or Create Company
  let company = await db.company.findFirst();
  if (!company) {
    company = await db.company.create({
      data: { name: 'Verification Labs Ltd', currency: 'USD', country: 'Egypt' },
    });
  }
  // Customers belong to a store now; this script uses the company's first.
  const seedStore = await db.store.findFirst({ where: { companyId: company.id } });
  if (!seedStore) throw new Error('no store to seed into');
  console.log('✅ Checkpoint 1: Multi-tenant Company verified:', company.name);

  // 2. Step 1: Create Product
  const testSku = `TEST-PROD-${Date.now()}`;
  const product = await db.product.create({
    data: {
      companyId: company.id,
      name: 'Organic Aloe Regenerative Gel',
      sku: testSku,
      basePrice: 30.0,
      status: 'ACTIVE',
    },
  });
  console.log('✅ Step 1: Product Created:', product.name, product.sku);

  // 3. Steps 2, 3, 4, 5: Create Production Batch & Calculate Cost Per Unit
  const batchCostResult = calculateBatchCosts({
    quantityProduced: 500,
    manufacturingCost: 1500,
    packagingCost: 400,
    rawMaterialCost: 600,
    otherCosts: 0,
  });

  if (batchCostResult.totalProductionCost !== 2500) {
    throw new Error(`Expected total cost 2500, got ${batchCostResult.totalProductionCost}`);
  }
  if (batchCostResult.costPerUnit !== 5.0) {
    throw new Error(`Expected unit cost 5.0, got ${batchCostResult.costPerUnit}`);
  }
  console.log('✅ Steps 2, 3, 4, 5: Cost Calculation Engine verified:', batchCostResult);

  const batch = await db.productionBatch.create({
    data: {
      companyId: company.id,
      productId: product.id,
      batchNumber: `BATCH-TEST-${Date.now()}`,
      quantityProduced: 500,
      quantitySold: 0,
      quantityRemaining: 500,
      manufacturingCost: 1500,
      packagingCost: 400,
      rawMaterialCost: 600,
      otherCosts: 0,
      totalProductionCost: batchCostResult.totalProductionCost,
      costPerUnit: batchCostResult.costPerUnit,
      status: 'COMPLETED',
    },
  });

  await db.inventoryMovement.create({
    data: {
      companyId: company.id,
      productId: product.id,
      batchId: batch.id,
      type: 'PRODUCTION',
      quantity: 500,
      balanceAfter: 500,
      reason: 'Batch production verified',
    },
  });
  console.log('✅ Batch & Initial Inventory Movement verified. Units available:', batch.quantityRemaining);

  // 4. Step 6: Create Offer
  const offer = await db.offer.create({
    data: {
      companyId: company.id,
      productId: product.id,
      name: '2 Bottles Aloe Duo ($50)',
      quantity: 2,
      sellingPrice: 50.0,
      discount: 10.0,
      deliveryIncluded: true,
      status: 'ACTIVE',
    },
  });
  console.log('✅ Step 6: Offer created:', offer.name, `Price: $${offer.sellingPrice}`);

  // 5. Step 7: Create Customer with Normalized Phone Duplicate Check
  const rawPhone = '+20 101 987 6543';
  const normPhone = normalizePhoneNumber(rawPhone);
  if (normPhone !== '01019876543') {
    throw new Error(`Normalization error: expected 01019876543, got ${normPhone}`);
  }
  console.log('✅ Phone Normalization verified: raw', rawPhone, '-> normalized', normPhone);

  const customer = await db.customer.upsert({
    where: { companyId_storeId_phone: { companyId: company.id, storeId: seedStore.id, phone: normPhone } },
    update: {},
    create: {
      companyId: company.id,
      fullName: 'Youssef Al-Amir',
      phone: normPhone,
      rawPhone: rawPhone,
      address: 'Dokki, Giza',
      city: 'Giza',
      totalOrders: 0,
    },
  });
  console.log('✅ Step 7: Customer CRM verified:', customer.fullName, customer.phone);

  // 6. Step 8 & 9: Create Order & Assign Moderator
  let moderator = await db.user.findFirst({
    where: { companyId: company.id, role: 'MODERATOR' },
  });
  if (!moderator) {
    moderator = await db.user.findFirst();
  }

  const orderNumber = `ORD-TEST-${Date.now()}`;
  const order = await db.order.create({
    data: {
      companyId: company.id,
      orderNumber,
      customerId: customer.id,
      productId: product.id,
      offerId: offer.id,
      quantity: offer.quantity, // 2 units
      sellingPrice: offer.sellingPrice,
      shippingCost: 4.0,
      totalAmount: offer.sellingPrice,
      moderatorId: moderator?.id || null,
      moderatorCommission: 2.5, // 5% of $50
      estimatedCostOfGoods: batch.costPerUnit * offer.quantity, // 2 * $5.0 = $10.0
      status: 'NEW',
      source: 'Facebook Ads',
    },
  });
  console.log('✅ Step 8 & 9: Order created and Moderator assigned:', order.orderNumber);

  // 7. Step 10 & 11: Moderator Calls Customer & Updates Status
  const callLog = await db.callLog.create({
    data: {
      companyId: company.id,
      orderId: order.id,
      moderatorId: moderator?.id || customer.id,
      result: 'CONFIRMED',
      notes: 'Customer confirmed 2-bottle duo pack delivery.',
    },
  });
  console.log('✅ Step 10: Call Log recorded:', callLog.result);

  // 8. Step 12: Confirm Order
  await db.order.update({
    where: { id: order.id },
    data: { status: 'CONFIRMED', confirmedAt: new Date() },
  });
  console.log('✅ Step 11 & 12: Order status transitioned to CONFIRMED');

  // 9. Step 13: Ship Order
  await db.order.update({
    where: { id: order.id },
    data: { status: 'SHIPPED', shippedAt: new Date() },
  });
  console.log('✅ Step 13: Order status transitioned to SHIPPED');

  // 10. Step 14 & 15: Deliver Order & Deduct Inventory
  const deliveredOrder = await db.order.update({
    where: { id: order.id },
    data: { status: 'DELIVERED', deliveredAt: new Date() },
  });

  // Deduct inventory
  await db.productionBatch.update({
    where: { id: batch.id },
    data: {
      quantitySold: { increment: deliveredOrder.quantity },
      quantityRemaining: { decrement: deliveredOrder.quantity },
    },
  });

  const movement = await db.inventoryMovement.create({
    data: {
      companyId: company.id,
      productId: product.id,
      batchId: batch.id,
      type: 'SALE',
      quantity: -deliveredOrder.quantity,
      balanceAfter: batch.quantityRemaining - deliveredOrder.quantity,
      referenceId: deliveredOrder.id,
      reason: `Delivered test order #${deliveredOrder.orderNumber}`,
    },
  });
  console.log('✅ Step 14 & 15: Order DELIVERED and stock successfully deducted. Movement:', movement.quantity);

  // 11. Steps 16, 17, 18: Calculate Delivered Revenue, COGS, and Real Net Profit
  const profitResult = calculateRealProfit({
    deliveredOrders: [
      {
        sellingPrice: deliveredOrder.sellingPrice,
        totalAmount: deliveredOrder.totalAmount,
        quantity: deliveredOrder.quantity,
        shippingCost: deliveredOrder.shippingCost,
        moderatorCommission: deliveredOrder.moderatorCommission,
        estimatedCostOfGoods: deliveredOrder.estimatedCostOfGoods,
      },
    ],
    operationalExpenses: 0,
  });

  // Verification formula check:
  // Revenue = 50.0
  // COGS = 10.0
  // Shipping = 4.0
  // Commission = 2.5
  // Net Profit = 50 - 10 - 4 - 2.5 = 33.5
  if (profitResult.deliveredRevenue !== 50) {
    throw new Error(`Expected revenue 50, got ${profitResult.deliveredRevenue}`);
  }
  if (profitResult.costOfGoodsSold !== 10) {
    throw new Error(`Expected COGS 10, got ${profitResult.costOfGoodsSold}`);
  }
  if (profitResult.netProfit !== 33.5) {
    throw new Error(`Expected net profit 33.5, got ${profitResult.netProfit}`);
  }
  console.log('✅ Steps 16, 17, 18: Real Net Profit Formula Verified with 100% precision:', profitResult);

  // 12. Step 19: Product Analytics & Rankings
  const analytics = await getCompanyAnalytics({ companyId: company.id, storeId: null }, { period: 'all' });
  if (!analytics.rankings.mostProfitable) {
    throw new Error('Analytics failed to calculate product rankings');
  }
  console.log('✅ Step 19: Product Performance & Rankings calculated successfully:');
  console.log('   - Most Profitable Product:', analytics.rankings.mostProfitable.name);
  console.log('   - Delivered Orders:', analytics.ordersCount.delivered);
  console.log('   - Confirmation Rate:', analytics.rates.confirmationRate + '%');

  // 13. Step 20: Generate AI Business Intelligence Summary
  const aiSummary = await generateAiBusinessAnalysis(analytics.aiContext);
  if (!aiSummary.summary || aiSummary.observations.length === 0) {
    throw new Error('AI business summary generation failed');
  }
  console.log('✅ Step 20: AI Business Intelligence Summary Generated:');
  console.log('   - Executive Summary:', aiSummary.summary);
  console.log('   - Key Observations count:', aiSummary.observations.length);
  console.log('   - Recommendations count:', aiSummary.recommendations.length);

  console.log('\n🎉 ALL 20 CRITICAL WORKFLOWS VERIFIED AND PASSING SUCCESSFULLY!');
}

runVerification()
  .catch((err) => {
    console.error('❌ Verification failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
