export default async () => Response.json({service:"WIN Worker Engine",status:"online",version:"0.1.0",time:new Date().toISOString(),note:"Health only; research API requires bearer authentication."});
