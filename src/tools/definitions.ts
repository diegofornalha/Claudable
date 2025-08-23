import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { guidanceTool } from './guidance-tool.js';

/**
 * MCP Neo4j Agent Memory Tools
 * 
 * Tool descriptions are kept simple to avoid breaking prompt templates in 3rd party solutions.
 * Use the get_guidance tool to access detailed information about labels, relationships, and best practices.
 */
export const tools: Tool[] = [
  {
    name: 'search_memories',
    description: 'Search and retrieve memories from the knowledge graph',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search text to find in any property (searches for ANY word - e.g. "Ben Weeks" finds memories containing "Ben" OR "Weeks")',
        },
        label: {
          type: 'string',
          description: 'Filter by memory label',
        },
        depth: {
          type: 'number',
          description: 'Relationship depth to include, defaults to 1',
        },
        order_by: {
          type: 'string',
          description: 'Sort order such as created_at DESC, name ASC',
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return, defaults to 10, max 200',
        },
        since_date: {
          type: 'string',
          description: 'ISO date string to filter memories created after this date (e.g., "2024-01-01" or "2024-01-01T00:00:00Z")',
        },
      },
      required: [],
    },
  },
  {
    name: 'create_memory',
    description: 'Create a new memory in the knowledge graph. Consider that the memory might already exist, so Search → Create → Connect (its important to try and connect memories)',
    inputSchema: {
      type: 'object',
      properties: {
        label: {
          type: 'string',
          description: 'Memory label in lowercase (use list_memory_labels first to check existing labels for consistency) - common: person, place, organization, project, event, topic, object, animal, plant, food, activity, media, skill, document, meeting, task, habit, health, vehicle, tool, idea, goal',
        },
        properties: {
          type: 'object',
          description: 'Information to store about this memory (use "name" as primary identifier, e.g. {name: "John Smith", age: 30, occupation: "Engineer"})',
          additionalProperties: true,
        },
      },
      required: ['label', 'properties'],
    },
  },
  {
    name: 'create_connection',
    description: 'Create a connection between two memories (its good to have connected memories)',
    inputSchema: {
      type: 'object',
      properties: {
        fromMemoryId: {
          type: 'number',
          description: 'ID of the source memory',
        },
        toMemoryId: {
          type: 'number',
          description: 'ID of the target memory',
        },
        type: {
          type: 'string',
          description: 'Relationship type such as KNOWS, WORKS_ON, LIVES_IN, HAS_SKILL, PARTICIPATES_IN',
        },
        properties: {
          type: 'object',
          description: 'Optional relationship metadata (e.g. {since: "2023-01", role: "Manager", status: "active"})',
          additionalProperties: true,
        },
      },
      required: ['fromMemoryId', 'toMemoryId', 'type'],
    },
  },
  {
    name: 'update_memory',
    description: 'Update properties of an existing memory such as adding more detail or make a change when you find out something new',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'number',
          description: 'ID of the memory to update',
        },
        properties: {
          type: 'object',
          description: 'Properties to update/add',
          additionalProperties: true,
        },
      },
      required: ['nodeId', 'properties'],
    },
  },
  {
    name: 'update_connection',
    description: 'Update properties of an existing connection between memories',
    inputSchema: {
      type: 'object',
      properties: {
        fromMemoryId: {
          type: 'number',
          description: 'ID of the source memory',
        },
        toMemoryId: {
          type: 'number',
          description: 'ID of the target memory',
        },
        type: {
          type: 'string',
          description: 'Relationship type to identify which connection to update (e.g. WORKS_AT, KNOWS, MANAGES)',
        },
        properties: {
          type: 'object',
          description: 'Properties to update/add (e.g. {status: "completed", end_date: "2024-01"})',
          additionalProperties: true,
        },
      },
      required: ['fromMemoryId', 'toMemoryId', 'type', 'properties'],
    },
  },
  {
    name: 'delete_memory',
    description: 'Delete a memory and all its connections (use with caution - this permanently removes the memory and all its connections)',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'number',
          description: 'ID of the memory to delete',
        },
      },
      required: ['nodeId'],
    },
  },
  {
    name: 'delete_connection',
    description: 'Delete a specific connection between two memories (use with caution - this permanently removes the relationship)',
    inputSchema: {
      type: 'object',
      properties: {
        fromMemoryId: {
          type: 'number',
          description: 'ID of the source memory',
        },
        toMemoryId: {
          type: 'number',
          description: 'ID of the target memory',
        },
        type: {
          type: 'string',
          description: 'Exact relationship type to delete (e.g. WORKS_AT, KNOWS, MANAGES)',
        },
      },
      required: ['fromMemoryId', 'toMemoryId', 'type'],
    },
  },
  {
    name: 'list_memory_labels',
    description: 'List all unique memory labels currently in use with their counts (useful for getting an overview of the knowledge graph)',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  guidanceTool,
];