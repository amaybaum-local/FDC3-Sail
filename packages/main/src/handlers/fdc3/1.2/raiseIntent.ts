import { ResolveError } from 'fdc3-1.2';
import { getRuntime } from '/@/index';
import { View } from '/@/view';
import { FDC3App, FDC3AppDetail } from '/@/types/FDC3Data';
import { FDC3_1_2_TOPICS } from './topics';
import { FDC3_2_0_TOPICS } from '../2.0/topics';
import { buildIntentInstanceTree, sortApps } from '../lib/raiseIntent';
//import { IntentTransfer } from '/@/types/TransferInstance';
import {
  FDC3Message,
  RaiseIntentData,
  RaiseIntentContextData,
} from '/@/types/FDC3Message';
import {
  DirectoryApp,
  DirectoryAppLaunchDetailsWeb,
} from '/@/directory/directory';

export const raiseIntent = async (message: FDC3Message) => {
  const runtime = getRuntime();

  const results: Array<FDC3App> = [];
  const data: RaiseIntentData = message.data as RaiseIntentData;
  const intent = data.intent;
  let intentTarget: string | undefined; //the id of the app the intent gets routed to (if unambigious)
  const intentContext = data.context?.type || '';

  //const intentTransfer = runtime.createIntentTransfer(message.source, intent, data.context);

  if (!intent) {
    //return {error:ResolveError.NoAppsFound};
    throw new Error(ResolveError.NoAppsFound);
  }

  //only support string targets for now...
  const target: string | undefined = data.target?.key;

  const intentListeners = target
    ? runtime.getIntentListenersByAppName(intent, target)
    : runtime.getIntentListeners(intent);

  if (intentListeners) {
    // let keys = Object.keys(intentListeners);
    intentListeners.forEach((listener) => {
      let addView = true;
      //look up the details of the window and directory metadata in the "connected" store
      const view = listener.viewId
        ? runtime.getView(listener.viewId)
        : undefined;

      //skip if can't be resolved to a view
      if (!view) {
        addView = false;
      }

      ///ignore listeners from the view that raised the intent
      if (listener.viewId && listener.viewId === message.source) {
        addView = false;
      }
      //ensure we are not sending the intent back to the source
      if (listener.viewId && listener.viewId === message.source) {
        addView = false;
      }
      //de-dupe
      if (
        view &&
        results.find((item) => {
          return item.details.instanceId === view.id;
        })
      ) {
        addView = false;
      }

      //match on context, if provided
      if (
        intentContext &&
        view &&
        view.directoryData?.interop?.intents?.listensFor &&
        view.directoryData?.interop?.intents?.listensFor[intent]
      ) {
        let hasContext = false;
        const viewIntent =
          view.directoryData.interop.intents.listensFor[intent];

        if (
          viewIntent.contexts &&
          viewIntent.contexts.indexOf(intentContext) > -1
        ) {
          hasContext = true;
        }

        if (!hasContext) {
          addView = false;
        }
      }

      if (view && addView) {
        results.push({
          type: 'window',
          details: {
            instanceId: view.id,
            directoryData: view.directoryData,
          },
        });
      }
    });
  }
  //pull intent handlers from the directory
  const directoryData: Array<DirectoryApp> = runtime
    .getDirectory()
    .retrieveByIntentAndContextType(intent, intentContext);

  directoryData.forEach((entry: DirectoryApp) => {
    let addResult = true;
    if (target && entry.name !== target) {
      addResult = false;
    }
    if (addResult) {
      results.push({
        type: 'directory',
        details: { directoryData: entry },
      });
    }
  });

  if (results.length > 0) {
    if (results.length === 1) {
      const theApp = results[0];
      const appDetails = theApp.details;
      //if there is only one result, use that
      //if it is an existing view, post a message directly to it
      //if it is a directory entry resolve the destination for the intent and launch it
      //dedupe window and directory items
      if (theApp.type === 'window' && appDetails?.instanceId) {
        intentTarget = appDetails?.instanceId;
        const view = runtime.getView(intentTarget);
        if (view) {
          if (view.fdc3Version === '1.2') {
            view.content.webContents.send(FDC3_1_2_TOPICS.INTENT, {
              topic: 'intent',
              data: message.data,
              source: message.source,
            });
          } else {
            view.content.webContents.send(FDC3_2_0_TOPICS.INTENT, {
              topic: 'intent',
              data: message.data,
              source: message.source,
            });
          }

          return {
            source: {
              name: view.directoryData?.name,
              appId: view.directoryData?.appId,
            },
            version: '1.2',
          };
        }
      } else if (theApp.type === 'directory' && appDetails.directoryData) {
        const directoryData = appDetails.directoryData;
        const directoryDetails = appDetails.directoryData
          .details as DirectoryAppLaunchDetailsWeb;
        const start_url = directoryDetails.url;
        const pending = true;

        const view = await getRuntime().createView(start_url, {
          directoryData: directoryData,
        });

        //set pending intent for the view..
        if (view && pending) {
          view.setPendingIntent(
            intent,
            data.context || undefined,
            message.source,
          );
        }

        return {
          source: { name: directoryData.name, appId: directoryData.appId },
          version: '1.2',
        };
      }
    } else {
      //launch window with resolver UI

      results.sort(sortApps);
      const sourceView = getRuntime().getView(message.source);
      if (sourceView) {
        getRuntime().openResolver(
          {
            intent: intent,
            context: data.context,
          },
          sourceView,
          results,
        );
      }
    }
  } else {
    //show message indicating no handler for the intent...
    // return {error:ResolveError.NoAppsFound};
    throw new Error(ResolveError.NoAppsFound);
  }
};

export const raiseIntentForContext = async (message: FDC3Message) => {
  const runtime = getRuntime();
  const sourceView = runtime.getView(message.source);
  const data: RaiseIntentContextData = message.data as RaiseIntentContextData;

  const sourceName =
    sourceView && sourceView.directoryData
      ? sourceView.directoryData.name
      : 'unknown';

  const r: Array<FDC3App> = [];

  const contextType = data.context.type || null;

  //throw errror if no context
  if (!contextType) {
    throw new Error(ResolveError.NoAppsFound);
  }
  /**
   * To Do: Support additional AppMetadata searching (other than name)
   */
  const target = data.target?.key || null;

  const intentListeners = runtime.getIntentListenersByContext(contextType);

  if (intentListeners) {
    // let keys = Object.keys(intentListeners);
    intentListeners.forEach((listeners: Array<View>, intent) => {
      let addListener = true;
      //look up the details of the window and directory metadata in the "connected" store
      listeners.forEach((view: View) => {
        if (target && target !== view.directoryData?.name) {
          addListener = false;
        }
        //de-dupe
        if (
          r.find((item) => {
            return (
              item.details.instanceId && item.details.instanceId === view.id
            );
          })
        ) {
          addListener = false;
        }

        if (addListener) {
          const title = view.getTitle();
          const details: FDC3AppDetail = {
            instanceId: view.id,
            title: title,
            directoryData: view.directoryData,
          };
          r.push({ type: 'window', details: details, intent: intent });
        }
      });
    });
  }

  const directoryData = getRuntime()
    .getDirectory()
    .retrieveByContextType(contextType);

  directoryData.forEach((entry: DirectoryApp) => {
    if (!target || (target && entry.name === target)) {
      r.push({ type: 'directory', details: { directoryData: entry } });
    }
  });

  if (r.length > 0) {
    if (r.length === 1) {
      //if there is only one result, use that
      //if it is a window, post a message directly to it
      //if it is a directory entry resolve the destination for the intent and launch it
      //dedupe window and directory items
      const result = r[0];
      //get the intent(s) for the item.
      //this will either be on the directory or listeners
      //To do: there may be multiple intent for the entry, in which case, we may hand off more resolution to the end user
      let intents: string[] = [];
      if (
        result.type === 'directory' &&
        result.details.directoryData?.interop?.intents?.listensFor
      ) {
        intents = Object.keys(
          result.details.directoryData?.interop?.intents?.listensFor,
        );
      } else if (result.type === 'window' && result.intent) {
        intents.push(result.intent);
      }
      //if there aren't any intents, just send context
      if (intents.length === 0) {
        if (result.type === 'window' && result.details.instanceId) {
          const view = runtime.getView(result.details.instanceId);
          if (view) {
            const topic =
              view.fdc3Version === '1.2'
                ? FDC3_1_2_TOPICS.CONTEXT
                : FDC3_2_0_TOPICS.CONTEXT;
            view.content.webContents.send(topic, {
              topic: 'context',
              data: {
                context: data.context,
              },
              source: message.source,
            });
          }
        } else if (
          result.type === 'directory' &&
          result.details.directoryData
        ) {
          const start_url = (
            result.details.directoryData.details as DirectoryAppLaunchDetailsWeb
          ).url;

          //let win = window.open(start_url,"_blank");
          const workspace = getRuntime().createWorkspace();

          const view = await workspace.createView(start_url, {
            directoryData: result.details.directoryData,
          });
          //view.directoryData = r[0].details.directoryData;
          //set pending context for the view..

          view.setPendingContext(data.context, message.source);

          return {
            source: {
              name: result.details.directoryData.name,
              appId: result.details.directoryData.appId,
            },
            version: '1.2',
          };
        }
      }
      //there is a known intent
      else {
        const intent = intents[0];
        //existing window?
        if (result.type === 'window' && result.details.instanceId) {
          const view = runtime.getView(result.details.instanceId);
          if (view) {
            const topic =
              view.fdc3Version === '1.2'
                ? FDC3_1_2_TOPICS.INTENT
                : FDC3_2_0_TOPICS.INTENT;

            view.content.webContents.send(topic, {
              topic: 'intent',
              data: {
                intent: intent,
                context: data.context,
              },
              source: message.source,
            });

            return { source: message.source, version: '1.2' };
          } else {
            //return {error:ResolveError.NoAppsFound};
            throw new Error(ResolveError.NoAppsFound);
          }
        } else if (
          result.type === 'directory' &&
          result.details.directoryData
        ) {
          //or new view?
          const start_url = (
            result.details.directoryData.details as DirectoryAppLaunchDetailsWeb
          ).url;
          const pending = true;

          //let win = window.open(start_url,"_blank");
          const workspace = getRuntime().createWorkspace();

          const view = await workspace.createView(start_url, {
            directoryData: result.details.directoryData,
          });

          //set pending intent for the view..
          if (pending && intent) {
            view.setPendingIntent(intent, data.context, message.source);
          }

          return {
            source: { name: sourceName, appId: message.source },
            version: '1.2',
          };
        }
      }
    } else {
      //show resolver UI
      // Send a message to the active tab
      //sort results alphabetically, with directory entries first (before window entries)

      r.sort(sortApps);

      //launch window with resolver UI
      console.log('resolve intent - options', r);
      const sourceView = getRuntime().getView(message.source);
      if (sourceView) {
        try {
          getRuntime().openResolver(
            { context: data.context },
            sourceView,
            buildIntentInstanceTree(r),
          );
        } catch (err) {
          console.log('error opening resolver', err);
        }
      }
    }
  } else {
    //show message indicating no handler for the intent...
    //return {error:ResolveError.NoAppsFound};
    throw new Error(ResolveError.NoAppsFound);
  }
};
