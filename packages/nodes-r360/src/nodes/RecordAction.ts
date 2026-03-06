import type {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionType } from 'n8n-workflow';

export class RecordAction implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Record Action',
    name: 'r360.recordAction',
    group: ['transform'],
    version: 1,
    description: 'Create, update, or archive a record in Record360',
    defaults: { name: 'Record Action' },
    inputs: [NodeConnectionType.Main],
    outputs: [NodeConnectionType.Main],
    properties: [
      {
        displayName: 'Action Type',
        name: 'actionType',
        type: 'options',
        options: [
          { name: 'Create', value: 'create' },
          { name: 'Update', value: 'update' },
          { name: 'Archive', value: 'archive' },
        ],
        default: 'create',
        required: true,
        description: 'The type of action to perform on the record',
      },
      {
        displayName: 'Record ID',
        name: 'recordId',
        type: 'string',
        default: '',
        description: 'The ID of the record (required for update and archive)',
      },
      {
        displayName: 'Data',
        name: 'data',
        type: 'json',
        default: '{}',
        description: 'JSON data for the record action',
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      const actionType = this.getNodeParameter('actionType', i) as string;
      const recordId = this.getNodeParameter('recordId', i) as string;
      const data = this.getNodeParameter('data', i) as string;

      // TODO: Call R360 API to perform record action
      returnData.push({
        json: {
          success: true,
          actionType,
          recordId,
          data: typeof data === 'string' ? JSON.parse(data) : data,
          executedAt: new Date().toISOString(),
        },
      });
    }

    return [returnData];
  }
}
