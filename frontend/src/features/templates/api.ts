import { apiClient } from "@/api/client";
import type { Decision } from "@/types/decision";
import type { DecisionFromTemplateInput, Template } from "@/types/template";

export async function listTemplates(): Promise<Template[]> {
  const { data } = await apiClient.get<Template[]>("/templates");
  return data;
}

export async function saveTemplate(body: {
  decision_id: string;
  name: string;
  description?: string;
}): Promise<Template> {
  const { data } = await apiClient.post<Template>("/templates", body);
  return data;
}

export async function deleteTemplate(id: string): Promise<void> {
  await apiClient.delete(`/templates/${id}`);
}

export async function createFromTemplate(body: DecisionFromTemplateInput): Promise<Decision> {
  const { data } = await apiClient.post<Decision>("/decisions/from-template", body);
  return data;
}

export async function getDemo(): Promise<{ decision_id: string | null }> {
  const { data } = await apiClient.get<{ decision_id: string | null }>("/demo");
  return data;
}

export async function createDemo(): Promise<Decision> {
  const { data } = await apiClient.post<Decision>("/demo/decision");
  return data;
}
