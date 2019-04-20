
Specification name: AMQP RPC with control channel 
Author: Eugene Demchenko (demchenkoev@gmail.com) 
Date: 2019-04-15 
License: GPLv3 

                              STEP 1 call remote procedure
                              =============================

       RPC client call                                                                                  RPC server
            >------------------------------------------------------------------------------------------------>
                        (to=<command>, reply-to=<client control queue>, correlation-id=baseCorrelationId,
                         content=<any>,  content-type=<any>
                        )
    
                                  - ERROR RESPONSE
    
    
       RPC client                                                                                       RPC server
            <------------------------------------------------------------------------------------------------<
                       (to=<client control queue>, reply-to=<server control queue>, correlation-id=baseCorrelationId,
                        content-type=application/rpc-control.v1+json
                        content={
                          "base-correlation-id": <baseCorrelationId>,
                          "event": "ERROR",
                          "error": {"code": <error code>, "message": <error message>}
                          }
                        )
    
    
                                  - SUCCESS RESPONSE FOR CONTINUOUS TASK
    
    
       RPC client                                                                                       RPC server
            <------------------------------------------------------------------------------------------------<
                       (to=<client control queue>, reply-to=<server control queue>, correlation-id=baseCorrelationId,
                        content-type=application/rpc-control.v1+json
                        content={
                           "base-correlation-id": <baseCorrelationId>,
                           "handler-version": <version of worker>
                           "event": "STARTED",
                           "incomming-events": ["CANCEL", "PAUSE", "PING", "STATE"],
                           "outgoing-events": ["PROGRESS", "SCHEDULED", "PONG", "PAUSED", "CANCELED", "COMPLETED", "WARNING", "ERROR"],
                           }
                        )
    
    
                                 - SUCCESS RESPONSE FOR SIMPLE TASK
    
    
       RPC client                                                                                       RPC server
            <------------------------------------------------------------------------------------------------<
                       (to=<client control queue>, reply-to=<server control queue>, correlation-id=baseCorrelationId,
                        content-type=<any> content=<any>
                        )
    
                                  STEP 2 receive state for continuous task
                                  =========================================
    
       RPC client                                                                                       RPC server
            <------------------------------------------------------------------------------------------------<
                       (to=<client control queue>, reply-to=<server control queue>, correlation-id=baseCorrelationId,
                        content-type=application/rpc-control.v1+json
                        content={
                           "base-correlation-id": <baseCorrelationId>,
                           "event": "PROGRESS",
                           "state": {
                             "completed_percents": 5,
                             "completed_bytes": 210,
                             "completed_items": 5,
                             "total_percents": 100,
                             "total_bytes": 10240,
                             "total_items": 90,
                             }
                           }
                        )
       RPC client                                                                                       RPC server
            <------------------------------------------------------------------------------------------------<
                       (to=<client control queue>, reply-to=<server control queue>, correlation-id=baseCorrelationId,
                        content-type=application/rpc-control.v1+json
                        content={
                           "base-correlation-id": <baseCorrelationId>,
                           "event": "COMPLETED",
                            "result": {
                              "url": "https://exmaple.com/downloads/de27b50c-5f9d-11e9-9e25-00163e74cbc0",
                              "mime_type": "video/mpeg",
                              "file_size": 10240,
                              "file_name": "example.mp4",
                              }
                           }
                        )
    
                                  STEP 3 send control command for continuous task
                                  ================================================
       RPC client                                                                                       RPC server
            >------------------------------------------------------------------------------------------------>
                        (to=<server control queue>, reply-to=<client control queue>, correlation-id=<baseCorrelationId>,
                         content-type=application/rpc-control.v1+json
                         content={
                           "base-correlation-id": <baseCorrelationId>,
                           "event": "CANCEL"
                           }
                        )
 