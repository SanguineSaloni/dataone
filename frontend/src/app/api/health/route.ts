import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json(
    { 
      status: 'healthy',
      service: 'DataOne Frontend',
      timestamp: new Date().toISOString(),
      port: process.env.PORT || '8080'
    },
    { status: 200 }
  );
}