import * as XLSX from 'xlsx';

export function exportMonthlyReport(payments, expenditures, yearMonth) {
  const wb = XLSX.utils.book_new();

  const totalEarnings = payments.reduce((sum, p) => sum + p.amount, 0);
  const totalExpenses = expenditures.reduce((sum, e) => sum + e.amount, 0);

  const summaryData = [
    ['UrbanRetreat Homestay - Monthly Report'],
    ['Month', yearMonth],
    [],
    ['Total Earnings (Rs)', totalEarnings],
    ['Total Expenditures (Rs)', totalExpenses],
    ['Net Profit (Rs)', totalEarnings - totalExpenses],
    [],
    ['Total Payment Entries', payments.length],
    ['Total Expenditure Entries', expenditures.length]
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  wsSummary['!cols'] = [{ wch: 30 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

  const paymentRows = payments.map(p => ({
    'Date': p.date,
    'Guest Name': p.guestName,
    'Building': Array.isArray(p.buildings) ? p.buildings.join(', ') : '-',
    'Room Numbers': Array.isArray(p.roomNumbers) ? p.roomNumbers.join(', ') : (p.rooms || '-'),
    'Amount (Rs)': p.amount
  }));
  if (paymentRows.length === 0) {
    paymentRows.push({ 'Date': '', 'Guest Name': 'No payments this month', 'Building': '', 'Room Numbers': '', 'Amount (Rs)': '' });
  }
  const wsPayments = XLSX.utils.json_to_sheet(paymentRows);
  wsPayments['!cols'] = [{ wch: 12 }, { wch: 25 }, { wch: 20 }, { wch: 16 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsPayments, 'Payments');

  const expenseRows = expenditures.map(e => ({
    'Date': e.date,
    'Description': e.description,
    'Amount (Rs)': e.amount
  }));
  if (expenseRows.length === 0) {
    expenseRows.push({ 'Date': '', 'Description': 'No expenditures this month', 'Amount (Rs)': '' });
  }
  const wsExpenses = XLSX.utils.json_to_sheet(expenseRows);
  wsExpenses['!cols'] = [{ wch: 12 }, { wch: 35 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsExpenses, 'Expenditures');

  const filename = `UrbanRetreat_Report_${yearMonth}.xlsx`;
  XLSX.writeFile(wb, filename);
}
