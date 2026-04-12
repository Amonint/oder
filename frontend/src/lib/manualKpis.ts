import type { ManualDataRecord } from "@/api/client";

export interface ManualKpis {
  acceptance_rate: number | null;
  close_rate: number | null;
  cost_per_accepted_lead: number | null;
  cost_per_sale: number | null;
  estimated_revenue: number;
  estimated_roas: number | null;
}

export function computeManualKpis(record: ManualDataRecord, spend: number): ManualKpis {
  const { useful_messages, accepted_leads, sales_closed, avg_ticket, estimated_revenue } = record;

  const acceptance_rate = useful_messages > 0 ? accepted_leads / useful_messages : null;
  const close_rate = accepted_leads > 0 ? sales_closed / accepted_leads : null;
  const cost_per_accepted_lead = accepted_leads > 0 ? spend / accepted_leads : null;
  const cost_per_sale = sales_closed > 0 ? spend / sales_closed : null;
  const revenue = estimated_revenue > 0 ? estimated_revenue : sales_closed * avg_ticket;
  const estimated_roas = spend > 0 && revenue > 0 ? revenue / spend : null;

  return {
    acceptance_rate,
    close_rate,
    cost_per_accepted_lead,
    cost_per_sale,
    estimated_revenue: revenue,
    estimated_roas,
  };
}

export function aggregateManualRecords(records: ManualDataRecord[]): ManualDataRecord {
  return records.reduce(
    (acc, r) => ({
      ...acc,
      useful_messages: acc.useful_messages + r.useful_messages,
      accepted_leads: acc.accepted_leads + r.accepted_leads,
      quotes_sent: acc.quotes_sent + r.quotes_sent,
      sales_closed: acc.sales_closed + r.sales_closed,
      avg_ticket: r.avg_ticket > 0 ? r.avg_ticket : acc.avg_ticket,
      estimated_revenue: acc.estimated_revenue + r.estimated_revenue,
    }),
    {
      account_id: records[0]?.account_id ?? "",
      useful_messages: 0,
      accepted_leads: 0,
      quotes_sent: 0,
      sales_closed: 0,
      avg_ticket: 0,
      estimated_revenue: 0,
      notes: "",
    } as ManualDataRecord
  );
}
