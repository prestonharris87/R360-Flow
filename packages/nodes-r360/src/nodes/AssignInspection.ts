import type {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

export class AssignInspection implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Assign Inspection',
    name: 'r360.assignInspection',
    group: ['transform'],
    version: 1,
    description: 'Assign an inspection to a user or team in Record360',
    defaults: { name: 'Assign Inspection' },
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    properties: [
      {
        displayName: 'Inspection ID',
        name: 'inspectionId',
        type: 'string',
        default: '',
        required: true,
        description: 'The ID of the inspection to assign',
      },
      {
        displayName: 'Assignee',
        name: 'assignee',
        type: 'string',
        default: '',
        required: true,
        description: 'The user or team to assign the inspection to',
      },
      {
        displayName: 'Priority',
        name: 'priority',
        type: 'options',
        options: [
          { name: 'Low', value: 'low' },
          { name: 'Medium', value: 'medium' },
          { name: 'High', value: 'high' },
          { name: 'Urgent', value: 'urgent' },
        ],
        default: 'medium',
        description: 'Priority level for the inspection',
      },
      {
        displayName: 'Notes',
        name: 'notes',
        type: 'string',
        default: '',
        description: 'Additional notes for the assignment',
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      const inspectionId = this.getNodeParameter('inspectionId', i) as string;
      const assignee = this.getNodeParameter('assignee', i) as string;
      const priority = this.getNodeParameter('priority', i) as string;
      const notes = this.getNodeParameter('notes', i) as string;

      // TODO: Call R360 API to assign inspection
      returnData.push({
        json: {
          success: true,
          inspectionId,
          assignee,
          priority,
          notes,
          assignedAt: new Date().toISOString(),
        },
      });
    }

    return [returnData];
  }
}
