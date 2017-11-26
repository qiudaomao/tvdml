/* global navigationDocument */

import { promisedTimeout } from './utils';
import { passthrough, createPipeline } from './pipelines';
import { vdomToDocument, createEmptyDocument } from './render/document';

let hasModal = false;

const RENDERING_ANIMATION = 600;

function createDocument(template, payload) {
  if (typeof template === 'string') {
    throw new Error('String templates aren\'t supported. Use jsx templates.');
  }

  if (typeof template === 'function') {
    // eslint-disable-next-line no-param-reassign
    template = template(payload);
  }

  if (typeof template === 'object' && template) {
    return vdomToDocument(template, payload);
  }

  return createEmptyDocument();
}

export function parseDocument(template) {
  return createPipeline().pipe(passthrough(payload => ({
    parsedDocument: createDocument(template, payload),
  })));
}

export function removeModal() {
  hasModal = false;
  navigationDocument.dismissModal(true);
}

export function renderModal(template) {
  return createPipeline()
    .pipe(passthrough(() => {
      if (!hasModal) return null;
      removeModal();
      return promisedTimeout(RENDERING_ANIMATION);
    }))
    .pipe(parseDocument(template))
    .pipe(passthrough(({ parsedDocument: document, route }) => {
      const lastDocument = navigationDocument.documents.pop();

      hasModal = true;

      // eslint-disable-next-line no-param-reassign
      document.modal = true;

      // eslint-disable-next-line no-param-reassign
      document.route = route || (lastDocument || {}).route;

      navigationDocument.presentModal(document);
    }));
}

export function render(template) {
  return createPipeline()
    .pipe(parseDocument(template))
    .pipe(passthrough((payload) => {
      const {
        route,
        redirect,
        navigation = {},
      } = payload;

      let {
        parsedDocument: document,
        document: renderedDocument,
      } = payload;

      const { menuBar, menuItem } = navigation;
      const { possiblyDismissedByUser } = renderedDocument || {};

      const prevRouteDocument = renderedDocument
        ? renderedDocument.prevRouteDocument
        : navigationDocument.documents.slice(-1)[0];

      document.route = route;
      document.prevRouteDocument = prevRouteDocument;

      if (prevRouteDocument === renderedDocument) {
        document.prevRouteDocument = null;
      }

      if (hasModal) removeModal();

      if (redirect && prevRouteDocument) {
        renderedDocument = prevRouteDocument;
      }

      if (menuBar && menuItem) {
        const menuItemDocument = menuBar.getDocument(menuItem);

        if (menuItemDocument !== document) {
          setTimeout(() => {
            menuBar.setDocument(document, menuItem);
          }, RENDERING_ANIMATION);
        }
      } else if (possiblyDismissedByUser) {
        /**
         * Because this stage should be noop we need to restore last
         * rendered document.
         */
        document = payload.renderedDocument;

        // eslint-disable-next-line max-len
        console.warn('Rendering pipeline was terminated by user. Skipping further renders...');
      } else if (renderedDocument) {
        navigationDocument.replaceDocument(document, renderedDocument);
      } else {
        navigationDocument.pushDocument(document);
      }

      return {
        document,
        redirect: false,
      };
    }))
    .pipe(passthrough(() => promisedTimeout(RENDERING_ANIMATION)));
}
