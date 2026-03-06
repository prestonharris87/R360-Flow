import type {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionType } from 'n8n-workflow';

export class DocumentAction implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Document Action',
    name: 'r360.documentAction',
    group: ['transform'],
    version: 1,
    description: 'Attach a document (photo, video, signature, or note) to an inspection in Record360',
    defaults: { name: 'Document Action' },
    inputs: [NodeConnectionType.Main],
    outputs: [NodeConnectionType.Main],
    properties: [
      {
        displayName: 'Document Type',
        name: 'documentType',
        type: 'options',
        options: [
          { name: 'Photo', value: 'photo' },
          { name: 'Video', value: 'video' },
          { name: 'Signature', value: 'signature' },
          { name: 'Note', value: 'note' },
        ],
        default: 'photo',
        required: true,
        description: 'The type of document to attach',
      },
      {
        displayName: 'Inspection ID',
        name: 'inspectionId',
        type: 'string',
        default: '',
        required: true,
        description: 'The ID of the inspection to attach the document to',
      },
      {
        displayName: 'File URL',
        name: 'fileUrl',
        type: 'string',
        default: '',
        description: 'URL of the file to attach (not required for notes)',
      },
      {
        displayName: 'Description',
        name: 'description',
        type: 'string',
        default: '',
        description: 'Description or content for the document',
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      const documentType = this.getNodeParameter('documentType', i) as string;
      const inspectionId = this.getNodeParameter('inspectionId', i) as string;
      const fileUrl = this.getNodeParameter('fileUrl', i) as string;
      const description = this.getNodeParameter('description', i) as string;

      // TODO: Call R360 API to attach document
      returnData.push({
        json: {
          success: true,
          documentType,
          inspectionId,
          fileUrl,
          description,
          attachedAt: new Date().toISOString(),
        },
      });
    }

    return [returnData];
  }
}
